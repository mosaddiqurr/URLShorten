import net from "node:net";
import { classifyAddress } from "../lib/net/ip";
import { AppError, unresolved } from "./errors";

const HIDDEN =
  /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u;
const INTERNAL_SUFFIX =
  /(?:^|\.)(localhost|local|internal|intranet|private|corp|home|lan|test|invalid|onion)$/i;
const INTERNAL_HOSTS = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "ip6-loopback",
  "ip6-localhost",
]);

export function parseHttpUrl(input: unknown): URL {
  if (typeof input !== "string" || input.length > 2048) {
    throw new AppError(
      400,
      "Enter a valid HTTP or HTTPS URL (up to 2,048 characters).",
    );
  }
  const raw = input.trim();
  // Check controls before trimming: URL() silently discards tabs and newlines.
  if (
    !/^https?:\/\/[^/?#]/i.test(raw) ||
    HIDDEN.test(raw) ||
    /[\u0000-\u001f\u007f]/u.test(input) ||
    /\\|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)
  ) {
    throw new AppError(400, "Enter a valid HTTP or HTTPS URL.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, "Enter a valid HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new AppError(
      400,
      "Enter a valid HTTP or HTTPS URL without a username or password.",
    );
  }
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return url;
}

export function assertPublicUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol)) throw unresolved();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.port && !["80", "443"].includes(url.port)) throw unresolved();
  if (INTERNAL_HOSTS.has(host) || INTERNAL_SUFFIX.test(host))
    throw unresolved();
  if (net.isIP(host)) {
    if (!classifyAddress(host).allowed) throw unresolved();
  } else if (
    !host.includes(".") ||
    !/^[a-z0-9.-]+$/i.test(host) ||
    host
      .split(".")
      .some(
        (label) =>
          !label ||
          label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
      )
  ) {
    throw unresolved();
  }
}
