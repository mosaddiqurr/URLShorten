import { randomInt } from "node:crypto";
import { aliasProblem, normalizeAlias } from "../shared/aliases";
import type { CreatedLink, StoredLink } from "../shared/types";
import type { LinkStore } from "./store";
import { AppError } from "./errors";
import { parseHttpUrl } from "./url";
import { publicAddresses } from "./network";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export function randomAlias(): string {
  return Array.from(
    { length: 7 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}

export async function createLink(
  input: { url?: unknown; alias?: unknown },
  origin: string,
  store: LinkStore,
  guard: typeof publicAddresses = publicAddresses,
  generate = randomAlias,
): Promise<CreatedLink> {
  const url = parseHttpUrl(input.url);
  if (url.hostname === new URL(origin).hostname)
    throw new AppError(
      400,
      "That URL already points to URLShorten. Use the original destination.",
    );
  if (input.alias !== undefined && typeof input.alias !== "string")
    throw new AppError(400, "Enter a valid custom alias.");
  const rawAlias = (input.alias as string | undefined) ?? "";
  const custom = normalizeAlias(rawAlias);
  if (rawAlias && (custom || /[\u0000-\u001f\u007f]/u.test(rawAlias))) {
    const problem = aliasProblem(rawAlias);
    if (problem) throw new AppError(400, problem);
  }
  await guard(url, AbortSignal.timeout(5000));
  for (let attempt = 0; attempt < 8; attempt++) {
    const alias = custom || generate();
    if (aliasProblem(alias)) continue;
    const record: StoredLink = {
      version: 1,
      alias,
      destination: url.href,
      createdAt: new Date().toISOString(),
    };
    if (await store.insert(record))
      return {
        alias,
        shortUrl: `${origin}/${alias}`,
        destination: record.destination,
        createdAt: record.createdAt,
      };
    if (custom) throw new AppError(409, "This custom link is already taken.");
  }
  throw new AppError(
    503,
    "A short link could not be created. Please try again.",
  );
}
