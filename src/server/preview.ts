import type { PreviewResult, RedirectStep } from "../shared/types";
import { aliasProblem, normalizeAlias } from "../shared/aliases";
import type { LinkStore } from "./store";
import { parseHttpUrl, assertPublicUrl } from "./url";
import {
  requestHeaders,
  NETWORK_LIMITS,
  type HeaderRequester,
} from "./network";
import { AppError, unresolved } from "./errors";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function previewLink(
  input: unknown,
  origin: string,
  store: LinkStore,
  request: HeaderRequester = requestHeaders,
): Promise<PreviewResult> {
  const initial = parseHttpUrl(input);
  const signal = AbortSignal.timeout(NETWORK_LIMITS.totalMs);
  const seen = new Set<string>();
  const chain: RedirectStep[] = [];
  let current = initial;
  for (let count = 0; count <= NETWORK_LIMITS.redirects; count++) {
    if (signal.aborted) throw unresolved();
    const networkUrl = new URL(current);
    networkUrl.hash = "";
    if (seen.has(networkUrl.href))
      throw new AppError(
        422,
        "The destination could not be resolved safely. The link redirects in a loop.",
      );
    seen.add(networkUrl.href);
    let status: number;
    let location: string | undefined;
    if (current.origin === origin) {
      // Local mappings are read from storage, never fetched through localhost
      // or the site's functions. This is the only own-origin special case.
      const rawAlias = current.pathname.replace(/^\/|\/$/g, "");
      if (aliasProblem(rawAlias))
        throw new AppError(404, "This shortened link was not found.");
      const record = await store.get(normalizeAlias(rawAlias));
      if (!record)
        throw new AppError(404, "This shortened link was not found.");
      status = 302;
      location = record.destination;
    } else {
      assertPublicUrl(current);
      let response = await request(current, "HEAD", signal);
      if ([405, 501].includes(response.status))
        response = await request(current, "GET", signal);
      status = response.status;
      location = response.location;
    }
    const step: RedirectStep = { url: current.href, status };
    chain.push(step);
    if (!REDIRECT_STATUSES.has(status)) {
      if (status < 200 || status >= 400)
        throw new AppError(
          422,
          "Preview is unavailable. The destination did not return a usable response.",
        );
      return {
        shortUrl: initial.href,
        destination: current.href,
        domain: current.hostname,
        https: current.protocol === "https:",
        redirects: chain.length - 1,
        chain,
        checkedAt: new Date().toISOString(),
      };
    }
    if (!location || count === NETWORK_LIMITS.redirects) throw unresolved();
    try {
      current = parseHttpUrl(new URL(location, current).href);
    } catch {
      throw unresolved();
    }
    step.target = current.href;
  }
  throw unresolved();
}
