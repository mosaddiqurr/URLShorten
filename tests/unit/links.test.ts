import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLink, randomAlias } from "../../src/server/links";
import {
  aliasProblem,
  normalizeAlias,
  RESERVED_ALIASES,
} from "../../src/shared/aliases";
import { fileStore, checkedRecord } from "../../src/server/store";
import { memoryStore, record } from "../helpers";

const origin = "https://urlshorten.netlify.app";
const guard = vi.fn(async () => ["93.184.215.14"]);
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe("custom and automatic aliases", () => {
  it("normalizes a custom alias and preserves the destination query and fragment", async () => {
    const store = memoryStore();
    const result = await createLink(
      {
        url: "https://example.com/a?z=2&x=1#section",
        alias: "  My_Project-26  ",
      },
      origin,
      store,
      guard,
    );
    expect(result.alias).toBe("my_project-26");
    expect(result.shortUrl).toBe(origin + "/my_project-26");
    expect((await store.get(result.alias))?.destination).toBe(
      "https://example.com/a?z=2&x=1#section",
    );
    expect(normalizeAlias(" Portfolio ")).toBe("portfolio");
  });
  it.each(["mos", "github", "portfolio", "research-2026", "my_project", "123"])(
    "accepts %s",
    (value) => expect(aliasProblem(value)).toBeNull(),
  );
  it.each([
    "a/b",
    "what?",
    "name#hash",
    "a%2fb",
    "a%252fb",
    "ab",
    "-hello",
    "你好",
    "test\n",
    "abc\u0000",
    "a".repeat(49),
  ])("rejects unsafe or malformed alias %s", (value) =>
    expect(aliasProblem(value)).not.toBeNull(),
  );
  it.each([...RESERVED_ALIASES])(
    "reserves route %s regardless of case",
    (value) => expect(aliasProblem(value.toUpperCase())).not.toBeNull(),
  );
  it("does not overwrite an existing mapping", async () => {
    const original = record();
    const store = memoryStore([original]);
    await expect(
      createLink(
        { url: "https://example.org/", alias: "PORTFOLIO" },
        origin,
        store,
        guard,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "This custom link is already taken.",
    });
    expect(await store.get("portfolio")).toEqual(original);
  });
  it("issues a short secure random alias when none is provided", async () => {
    const result = await createLink(
      { url: "https://example.com/" },
      origin,
      memoryStore(),
      guard,
    );
    expect(result.alias).toMatch(/^[a-z0-9]{7}$/);
    const sample = Array.from({ length: 1000 }, randomAlias);
    expect(new Set(sample).size).toBe(1000);
  });
  it("retries a collision and a reserved generated name", async () => {
    const generate = vi
      .fn()
      .mockReturnValueOnce("preview")
      .mockReturnValueOnce("taken12")
      .mockReturnValueOnce("fresh12");
    const result = await createLink(
      { url: "https://example.com/" },
      origin,
      memoryStore([record("taken12")]),
      guard,
      generate,
    );
    expect(result.alias).toBe("fresh12");
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it("fails clearly when all random attempts collide", async () => {
    await expect(
      createLink(
        { url: "https://example.com/" },
        origin,
        memoryStore([record("taken12")]),
        guard,
        () => "taken12",
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    "not a url",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https:///example.com/",
    "https:////example.com/",
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com/\npath",
  ])("rejects invalid input %s", async (url) => {
    await expect(
      createLink({ url }, origin, memoryStore(), guard),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects self references and non-string aliases", async () => {
    await expect(
      createLink({ url: origin + "/other" }, origin, memoryStore(), guard),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createLink(
        { url: "https://example.com/", alias: 42 },
        origin,
        memoryStore(),
        guard,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("persistent local storage", () => {
  it("survives recreating the store and atomically rejects competing writers", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "urlshorten-test-"));
    directories.push(dir);
    const competing = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        fileStore(dir).insert(
          record("same-alias", `https://example.com/${index}`),
        ),
      ),
    );
    expect(competing.filter(Boolean)).toHaveLength(1);
    const stored = await fileStore(dir).get("same-alias");
    expect(stored?.destination).toMatch(/^https:\/\/example.com\/\d+$/);
    expect(await fileStore(dir).get("not-found")).toBeNull();
  });
  it.each(["../file", "%2e%2e", "api"])(
    "blocks storage key traversal or reserved key %s",
    async (alias) => {
      await expect(fileStore().get(alias)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it("validates every stored destination and record shape", () => {
    expect(() =>
      checkedRecord(
        { ...record(), destination: "javascript:alert(1)" },
        "portfolio",
      ),
    ).toThrow();
    expect(() =>
      checkedRecord(
        { ...record(), destination: "https://127.0.0.1/" },
        "portfolio",
      ),
    ).toThrow();
    expect(() =>
      checkedRecord({ ...record(), alias: "different" }, "portfolio"),
    ).toThrow();
    expect(checkedRecord(null, "portfolio")).toBeNull();
  });
});
