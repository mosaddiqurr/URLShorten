import { describe, expect, it, vi } from "vitest";
import { previewLink } from "../../src/server/preview";
import { NETWORK_LIMITS, type HeaderRequester } from "../../src/server/network";
import { memoryStore, record } from "../helpers";

const origin = "https://urlshorten.netlify.app";
describe("destination preview", () => {
  it("reads an own-site link from storage and shows the complete HTTP chain without navigating", async () => {
    const request = vi
      .fn<HeaderRequester>()
      .mockResolvedValueOnce({ status: 301, location: "/final#details" })
      .mockResolvedValueOnce({ status: 200 });
    const result = await previewLink(
      origin + "/portfolio",
      origin,
      memoryStore([record()]),
      request,
    );
    expect(result.destination).toBe("https://example.com/final#details");
    expect(result.domain).toBe("example.com");
    expect(result.https).toBe(true);
    expect(result.redirects).toBe(2);
    expect(result.chain.map((hop) => hop.status)).toEqual([302, 301, 200]);
    expect(result.chain[0]?.target).toBe("https://example.com/page");
    expect(request.mock.calls[0]?.[0].href).toBe("https://example.com/page");
  });
  it("supports external links and bounded GET fallback", async () => {
    const request = vi
      .fn<HeaderRequester>()
      .mockResolvedValueOnce({ status: 405 })
      .mockResolvedValueOnce({
        status: 302,
        location: "https://example.com/final",
      })
      .mockResolvedValueOnce({ status: 200 });
    const result = await previewLink(
      "https://bit.ly/sample",
      origin,
      memoryStore(),
      request,
    );
    expect(request.mock.calls.map((call) => call[1])).toEqual([
      "HEAD",
      "GET",
      "HEAD",
    ]);
    expect(result.redirects).toBe(1);
  });
  it("reports a plain HTTP destination without labeling it safe", async () => {
    const result = await previewLink(
      "http://example.com/",
      origin,
      memoryStore(),
      async () => ({ status: 200 }),
    );
    expect(result.https).toBe(false);
    expect(result.redirects).toBe(0);
    expect(result).not.toHaveProperty("score");
  });
  it("does not request a private redirect target", async () => {
    const request = vi.fn<HeaderRequester>().mockResolvedValue({
      status: 302,
      location: "http://169.254.169.254/latest/meta-data",
    });
    await expect(
      previewLink("https://bit.ly/sample", origin, memoryStore(), request),
    ).rejects.toMatchObject({ status: 422 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "https://127.0.0.1/",
    "http://[::1]/",
    "http://localhost/",
  ])("blocks unsafe redirect %s", async (location) => {
    const request = vi
      .fn<HeaderRequester>()
      .mockResolvedValue({ status: 302, location });
    await expect(
      previewLink("https://bit.ly/sample", origin, memoryStore(), request),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds the number of redirects", async () => {
    let count = 0;
    const request = vi.fn<HeaderRequester>().mockImplementation(async () => ({
      status: 302,
      location: `https://example.com/${++count}`,
    }));
    await expect(
      previewLink("https://example.com/start", origin, memoryStore(), request),
    ).rejects.toMatchObject({ status: 422 });
    expect(request).toHaveBeenCalledTimes(NETWORK_LIMITS.redirects + 1);
  });
  it("detects redirect loops, including fragment-only changes", async () => {
    const request = vi
      .fn<HeaderRequester>()
      .mockResolvedValue({ status: 302, location: "#loop" });
    await expect(
      previewLink("https://example.com/start", origin, memoryStore(), request),
    ).rejects.toThrow(/loop/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("handles missing mappings, missing redirect headers and blocked services", async () => {
    await expect(
      previewLink(origin + "/missing", origin, memoryStore(), async () => ({
        status: 200,
      })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      previewLink("https://example.com/", origin, memoryStore(), async () => ({
        status: 302,
      })),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      previewLink("https://example.com/", origin, memoryStore(), async () => ({
        status: 403,
      })),
    ).rejects.toThrow(/unavailable/);
  });
});
