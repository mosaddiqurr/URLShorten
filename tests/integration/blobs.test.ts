import { describe, expect, it, vi } from "vitest";
import { getStore } from "@netlify/blobs";
import { netlifyStore } from "../../src/server/store";
import { record } from "../helpers";

const fake = vi.hoisted(() => ({ get: vi.fn(), setJSON: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: vi.fn(() => fake) }));

describe("Netlify persistent storage contract", () => {
  it("uses a strongly consistent site store and atomic only-if-new writes", async () => {
    fake.setJSON.mockResolvedValue({ modified: true, etag: "etag" });
    fake.get.mockResolvedValue(record());
    const store = netlifyStore("production");
    expect(getStore).toHaveBeenCalledWith({
      name: "urlshorten-links",
      consistency: "strong",
    });
    expect(await store.insert(record())).toBe(true);
    expect(fake.setJSON).toHaveBeenCalledWith("portfolio", record(), {
      onlyIfNew: true,
    });
    expect(await store.get("portfolio")).toEqual(record());
  });
  it("handles collisions and missing records without overwriting data", async () => {
    fake.setJSON.mockResolvedValue({ modified: false });
    fake.get.mockResolvedValue(null);
    const store = netlifyStore("production");
    expect(await store.insert(record())).toBe(false);
    expect(await store.get("missing")).toBeNull();
  });
  it("isolates deploy previews from production mappings", () => {
    netlifyStore("deploy-preview");
    expect(getStore).toHaveBeenCalledWith({
      name: "urlshorten-links-previews",
      consistency: "strong",
    });
  });
});
