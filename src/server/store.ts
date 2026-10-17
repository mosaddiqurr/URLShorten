import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import type { StoredLink } from "../shared/types";
import { aliasProblem } from "../shared/aliases";
import { AppError } from "./errors";
import { parseHttpUrl, assertPublicUrl } from "./url";

export interface LinkStore {
  get(alias: string): Promise<StoredLink | null>;
  insert(record: StoredLink): Promise<boolean>;
}

export function checkedRecord(
  value: unknown,
  alias: string,
): StoredLink | null {
  if (value === null) return null;
  const record = value as Partial<StoredLink>;
  if (
    !record ||
    record.version !== 1 ||
    record.alias !== alias ||
    aliasProblem(alias) ||
    typeof record.destination !== "string" ||
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw new AppError(503, "This shortened link is unavailable.");
  }
  try {
    assertPublicUrl(parseHttpUrl(record.destination));
  } catch {
    throw new AppError(503, "This shortened link is unavailable.");
  }
  return record as StoredLink;
}

export function netlifyStore(deployContext = "production"): LinkStore {
  const name =
    process.env.URLSHORTEN_STORE_NAME ||
    (deployContext === "production"
      ? "urlshorten-links"
      : "urlshorten-links-previews");
  const blobs = getStore({ name, consistency: "strong" });
  return {
    async get(alias) {
      return checkedRecord(await blobs.get(alias, { type: "json" }), alias);
    },
    async insert(record) {
      return (await blobs.setJSON(record.alias, record, { onlyIfNew: true }))
        .modified;
    },
  };
}

// Development only. Never selected by a deployed function. Publishing a hard
// link is atomic and exclusive, including concurrent processes on Windows.
export function fileStore(
  directory = process.env.URLSHORTEN_DATA_DIR || ".data/links",
): LinkStore {
  const root = path.resolve(directory);
  const filename = (alias: string) => {
    if (aliasProblem(alias)) throw new AppError(400, "That alias is invalid.");
    return path.join(root, alias + ".json");
  };
  return {
    async get(alias) {
      try {
        return checkedRecord(
          JSON.parse(await readFile(filename(alias), "utf8")),
          alias,
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async insert(record) {
      const destination = filename(record.alias);
      await mkdir(root, { recursive: true });
      const temporary = path.join(root, randomUUID() + ".tmp");
      try {
        await writeFile(temporary, JSON.stringify(record), {
          flag: "wx",
          mode: 0o600,
        });
        try {
          await link(temporary, destination);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
          throw error;
        }
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
  };
}
