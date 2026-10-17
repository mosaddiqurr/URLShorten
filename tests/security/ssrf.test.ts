import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { EventEmitter } from "node:events";
import https from "node:https";
import type http from "node:http";
import { classifyAddress } from "../../src/lib/net/ip";
import { parseHttpUrl, assertPublicUrl } from "../../src/server/url";
import {
  publicAddresses,
  requestHeaders,
  NETWORK_LIMITS,
} from "../../src/server/network";

const mockedLookup = () =>
  vi.mocked(dns.lookup) as unknown as Mock<() => Promise<LookupAddress[]>>;
beforeEach(() => {
  vi.spyOn(dns, "lookup");
  mockedLookup().mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
});
afterEach(() => vi.useRealTimers());

describe("public address guard", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.100.100.200",
    "100.64.0.1",
    "127.0.0.1",
    "127.2.3.4",
    "169.254.169.254",
    "169.254.170.2",
    "169.254.1.1",
    "168.63.129.16",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::8.8.8.8",
    "::ffff:127.0.0.1",
    "::ffff:192.168.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "2001:db8::1",
    "3fff::1",
    "2001:2::1",
    "2001:20::1",
    "fe80::1",
    "fc00::1",
    "fd00:ec2::254",
    "ff00::1",
    "4000::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(classifyAddress(address).allowed).toBe(false);
  });
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.215.14",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts public address %s", (address) =>
    expect(classifyAddress(address).allowed).toBe(true),
  );
  it.each([
    "http://localhost/",
    "http://foo.localhost/",
    "http://metadata.google.internal/",
    "http://intranet/",
    "http://server.internal/",
    "http://example.com:8080/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://127.0.0.1./",
    "http://[::ffff:7f00:1]/",
  ])(
    "blocks private, encoded or internal URL %s before any DNS request",
    async (input) => {
      await expect(publicAddresses(parseHttpUrl(input))).rejects.toMatchObject({
        status: 422,
      });
      expect(dns.lookup).not.toHaveBeenCalled();
    },
  );
  it.each([
    "file:///etc/passwd",
    "gopher://example.com/",
    "https://example.com/\tpath",
    "https://example.com/%0d%0aHeader",
    "https://user:password@example.com/",
    "https://example.com/\\path",
    "https://example.com/\u202epath",
  ])("rejects parser differentials %s", (input) =>
    expect(() => parseHttpUrl(input)).toThrow(),
  );
  it("rejects all mixed public/private A and AAAA answers", async () => {
    mockedLookup().mockResolvedValue([
      { address: "93.184.215.14", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      publicAddresses(new URL("https://example.com")),
    ).rejects.toThrow();

    mockedLookup().mockResolvedValue([
      { address: "93.184.215.14", family: 4 },
      { address: "fd00::1", family: 6 },
    ]);
    await expect(
      publicAddresses(new URL("https://example.com")),
    ).rejects.toThrow();
  });
  it("fails closed for a DNS failure", async () => {
    mockedLookup().mockRejectedValue(
      Object.assign(new Error("timeout"), { code: "ETIMEOUT" }),
    );
    await expect(
      publicAddresses(new URL("https://example.com")),
    ).rejects.toThrow();
  });
  it("bounds a DNS lookup that never completes", async () => {
    vi.useFakeTimers();
    mockedLookup().mockImplementation(() => new Promise(() => undefined));
    const assertion = expect(
      publicAddresses(new URL("https://example.com")),
    ).rejects.toMatchObject({ status: 422 });
    await vi.advanceTimersByTimeAsync(NETWORK_LIMITS.dnsMs + 1);
    await assertion;
  });
  it("fails closed when there are no addresses or the overall deadline has expired", async () => {
    mockedLookup().mockResolvedValue([]);
    await expect(
      publicAddresses(new URL("https://example.com")),
    ).rejects.toThrow();
    await expect(
      publicAddresses(new URL("https://example.com"), AbortSignal.abort()),
    ).rejects.toThrow();
  });
  it("does not need DNS for a checked public IP literal", async () => {
    expect(await publicAddresses(new URL("https://8.8.8.8/"))).toEqual([
      "8.8.8.8",
    ]);
    expect(dns.lookup).not.toHaveBeenCalled();
    expect(() => assertPublicUrl(new URL("ftp://example.com"))).toThrow();
  });
});

describe("pinned header-only HTTP transport", () => {
  function fakeTransport(responseStatus = 200, respond = true) {
    let captured: https.RequestOptions | undefined;
    const response = {
      statusCode: responseStatus,
      headers: { location: "/final" },
      destroy: vi.fn(),
    } as unknown as http.IncomingMessage;
    const emitter = new EventEmitter();
    const client = Object.assign(emitter, {
      end: () => {
        if (respond) callback!(response);
      },
      destroy: (error?: Error) => {
        if (error) emitter.emit("error", error);
        emitter.emit("close");
        return client;
      },
    });
    let callback: ((response: http.IncomingMessage) => void) | undefined;
    const fake = (
      options: https.RequestOptions,
      cb: (res: http.IncomingMessage) => void,
    ) => {
      captured = options;
      callback = cb;
      return client as unknown as http.ClientRequest;
    };
    vi.spyOn(https, "request").mockImplementation(fake as typeof https.request);
    return { options: () => captured!, response, client };
  }
  it("pins the checked IP without a second DNS lookup and keeps TLS verification enabled", async () => {
    const fake = fakeTransport();
    expect(
      await requestHeaders(
        new URL("https://example.com/path?x=1"),
        "HEAD",
        AbortSignal.timeout(5000),
      ),
    ).toEqual({ status: 200, location: "/final" });
    const options = fake.options();
    expect(options.hostname).toBe("example.com");
    expect(options.path).toBe("/path?x=1");
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.agent).toBe(false);
    let pinned: unknown;
    options.lookup!("example.com", {}, (error, address, family) => {
      expect(error).toBeNull();
      pinned = { address, family };
    });
    expect(pinned).toEqual({ address: "93.184.215.14", family: 4 });
    expect(dns.lookup).toHaveBeenCalledTimes(1);
    expect(fake.response.destroy).toHaveBeenCalled();
  });
  it("caps headers, sends a bounded Range for GET, and discards the body immediately", async () => {
    const fake = fakeTransport();
    await requestHeaders(
      new URL("https://example.com/"),
      "GET",
      AbortSignal.timeout(5000),
    );
    expect(fake.options().maxHeaderSize).toBe(NETWORK_LIMITS.headerBytes);
    expect(fake.options().headers).toMatchObject({
      Range: "bytes=0-65535",
      "Accept-Encoding": "identity",
      Connection: "close",
    });
    expect(fake.options().headers).not.toHaveProperty("Cookie");
    expect(fake.options().headers).not.toHaveProperty("Authorization");
    expect(fake.response.destroy).toHaveBeenCalledTimes(1);
  });
  it("enforces an absolute per-request timeout even when a peer keeps a connection alive", async () => {
    vi.useFakeTimers();
    fakeTransport(200, false);
    const promise = requestHeaders(
      new URL("https://example.com/"),
      "HEAD",
      new AbortController().signal,
    );
    const assertion = expect(promise).rejects.toMatchObject({ status: 422 });
    await vi.advanceTimersByTimeAsync(NETWORK_LIMITS.requestMs + 1);
    await assertion;
  });
  it("never opens a socket for a private DNS answer", async () => {
    const request = vi.spyOn(https, "request");
    mockedLookup().mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      requestHeaders(
        new URL("https://example.com/"),
        "HEAD",
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
