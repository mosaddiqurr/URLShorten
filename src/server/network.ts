import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { classifyAddress } from "../lib/net/ip";
import { assertPublicUrl } from "./url";
import { unresolved } from "./errors";

export const NETWORK_LIMITS = {
  dnsMs: 2000,
  requestMs: 3000,
  totalMs: 10_000,
  redirects: 6,
  headerBytes: 16_384,
  fallbackBytes: 65_536,
} as const;

export async function publicAddresses(
  url: URL,
  signal?: AbortSignal,
): Promise<string[]> {
  assertPublicUrl(url);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (signal?.aborted) throw unresolved();
  if (net.isIP(host)) return [host];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    // Use the OS resolver for compatibility with Windows and encrypted DNS.
    // Hosts-file/NSS results receive exactly the same public-IP validation;
    // the checked address is still pinned, with no second lookup in HTTP.
    const answers = await Promise.race([
      dns.lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        cancel = () => reject(unresolved());
        timer = setTimeout(cancel, NETWORK_LIMITS.dnsMs);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
      }),
    ]);
    const addresses = answers.map((answer) => answer.address);
    if (
      signal?.aborted ||
      !addresses.length ||
      addresses.some((address) => !classifyAddress(address).allowed)
    )
      throw unresolved();
    return addresses;
  } catch {
    throw unresolved();
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}

export interface HeaderResponse {
  status: number;
  location?: string;
}
export type HeaderRequester = (
  url: URL,
  method: "HEAD" | "GET",
  signal: AbortSignal,
) => Promise<HeaderResponse>;

// Adapted from the existing IP-pinned client. TLS trust and hostname checks are
// mandatory; preview only needs headers, so no page content is retained.
export const requestHeaders: HeaderRequester = async (url, method, signal) => {
  const addresses = await publicAddresses(url, signal);
  const address = addresses[0]!;
  const family = net.isIP(address);
  const lookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method,
        lookup,
        agent: false,
        family,
        rejectUnauthorized: true,
        maxHeaderSize: NETWORK_LIMITS.headerBytes,
        signal,
        headers: {
          "User-Agent": "URLShorten-Preview/2.0",
          Accept: "*/*",
          "Accept-Encoding": "identity",
          Connection: "close",
          ...(method === "GET"
            ? { Range: `bytes=0-${NETWORK_LIMITS.fallbackBytes - 1}` }
            : {}),
        },
      },
      (response) => {
        const result = {
          status: response.statusCode ?? 502,
          location: response.headers.location,
        };
        // Do not download, decompress, parse or execute any response body. Even
        // a server ignoring Range cannot make us buffer its page or stream.
        response.destroy();
        request.destroy();
        resolve(result);
      },
    );
    const deadline = setTimeout(
      () => request.destroy(unresolved()),
      NETWORK_LIMITS.requestMs,
    );
    request.once("close", () => clearTimeout(deadline));
    request.once("error", () => reject(unresolved()));
    request.end();
  });
};
