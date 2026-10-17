import { describe, expect, it, vi } from "vitest";
import {
  handleCreate,
  handlePreview,
  handleRedirect,
  withErrors,
} from "../../src/server/handlers";
import { publicAddresses, requestHeaders } from "../../src/server/network";
import { memoryStore, record } from "../helpers";

vi.mock("../../src/server/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/network")>()),
  publicAddresses: vi.fn(async () => ["93.184.215.14"]),
  requestHeaders: vi.fn(async () => ({ status: 200 })),
}));
const origin = "https://urlshorten.netlify.app";
const request = (
  body: unknown,
  path = "/api/links",
  headers: Record<string, string> = {},
) =>
  new Request(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("HTTP link lifecycle", () => {
  it("returns a safe response when storage initialization throws synchronously", async () => {
    const response = await withErrors(() => {
      throw new Error("SECRET_TOKEN=storage-initialization-failed");
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "This service is temporarily unavailable. Please try again.",
    });
  });
  it("creates a mapping, redirects from /alias, and previews the same persisted link", async () => {
    const store = memoryStore();
    const created = await handleCreate(
      request({ url: "https://example.com/page#section", alias: "portfolio" }),
      store,
    );
    expect(created.status).toBe(201);
    const data = await created.json();
    expect(data.shortUrl).toBe(origin + "/portfolio");
    const redirect = await handleRedirect(new Request(data.shortUrl), store);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(
      "https://example.com/page#section",
    );
    expect(redirect.headers.get("cache-control")).toBe("no-store");
    const preview = await handlePreview(
      request({ url: data.shortUrl }, "/api/preview"),
      store,
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      destination: "https://example.com/page#section",
      redirects: 1,
      domain: "example.com",
      https: true,
    });
    expect(requestHeaders).toHaveBeenCalledTimes(1);
    expect(preview.headers.get("location")).toBeNull();
  });
  it("uses the actual public HTTPS origin and ignores forwarded host spoofing", async () => {
    const publicOrigin = "https://links.example.org";
    const response = await handleCreate(
      new Request(publicOrigin + "/api/links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: publicOrigin,
          "X-Forwarded-Host": "localhost:5173",
          "X-Forwarded-Proto": "http",
        },
        body: JSON.stringify({
          url: "https://example.com/",
          alias: "public-domain",
        }),
      }),
      memoryStore(),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).shortUrl).toBe(
      publicOrigin + "/public-domain",
    );
  });
  it("enforces method, origin, JSON shape and actual body size", async () => {
    const store = memoryStore();
    expect(
      (await handleCreate(new Request(origin + "/api/links"), store)).status,
    ).toBe(405);
    expect(
      (
        await handleCreate(
          request({ url: "https://example.com" }, "/api/links", {
            Origin: "https://evil.example",
          }),
          store,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleCreate(
          request({}, "/api/links", { "Content-Type": "text/plain" }),
          store,
        )
      ).status,
    ).toBe(415);
    expect((await handleCreate(request(["not an object"]), store)).status).toBe(
      400,
    );
    expect(
      (await handleCreate(request({ ignored: "x".repeat(9000) }), store))
        .status,
    ).toBe(413);
  });
  it("returns duplicate, invalid and reserved alias errors without losing the mapping", async () => {
    const store = memoryStore([record()]);
    expect(
      (
        await handleCreate(
          request({ url: "https://example.com/", alias: "portfolio" }),
          store,
        )
      ).status,
    ).toBe(409);
    expect(
      (await handleCreate(request({ url: "not a url" }), store)).status,
    ).toBe(400);
    expect(
      (
        await handleCreate(
          request({ url: "https://example.com/", alias: "api" }),
          store,
        )
      ).status,
    ).toBe(400);
    expect(await store.get("portfolio")).toEqual(record());
  });
  it("validates stored destinations again before redirect and refuses newly private DNS answers", async () => {
    vi.mocked(publicAddresses).mockRejectedValueOnce(
      new Error("private DNS target"),
    );
    const response = await handleRedirect(
      new Request(origin + "/portfolio"),
      memoryStore([record()]),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("private DNS target");
  });
  it("serves friendly missing-link pages, supports HEAD, and ignores query parameters when redirecting", async () => {
    const store = memoryStore([record()]);
    const missing = await handleRedirect(
      new Request(origin + "/missing"),
      store,
    );
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain(
      "This shortened link was not found.",
    );
    const head = await handleRedirect(
      new Request(origin + "/PORTFOLIO/?destination=http://localhost", {
        method: "HEAD",
      }),
      store,
    );
    expect(head.status).toBe(302);
    expect(head.headers.get("location")).toBe(record().destination);
    expect(await head.text()).toBe("");
  });
  it("never exposes storage errors or secrets to the browser", async () => {
    const store = memoryStore();
    store.insert = async () => {
      throw new Error("SECRET_TOKEN=should-never-leak");
    };
    const response = await handleCreate(
      request({ url: "https://example.com/" }),
      store,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SECRET_TOKEN");
  });
});
