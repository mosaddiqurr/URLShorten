import type { LinkStore } from "../src/server/store";
import type { StoredLink } from "../src/shared/types";

export function memoryStore(records: StoredLink[] = []): LinkStore {
  const data = new Map(records.map((record) => [record.alias, record]));
  return {
    get: async (alias) => data.get(alias) ?? null,
    insert: async (record) => {
      if (data.has(record.alias)) return false;
      data.set(record.alias, record);
      return true;
    },
  };
}
export const record = (
  alias = "portfolio",
  destination = "https://example.com/page",
): StoredLink => ({
  version: 1,
  alias,
  destination,
  createdAt: "2026-10-04T00:00:00.000Z",
});
