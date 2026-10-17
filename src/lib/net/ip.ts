import net from "node:net";

/**
 * IP address classification for SSRF defence.
 *
 * This is the single source of truth for "may the server open a connection to
 * this address?". Special-purpose IPv4 ranges are excluded; IPv6 addresses
 * outside allocated global unicast space fail closed. IPv4-mapped IPv6
 * receives the same guard as its embedded IPv4 address.
 */

export type AddressClass =
  | "GLOBAL_UNICAST"
  | "LOOPBACK"
  | "PRIVATE"
  | "LINK_LOCAL"
  | "CLOUD_METADATA"
  | "CGNAT"
  | "MULTICAST"
  | "BROADCAST"
  | "UNSPECIFIED"
  | "RESERVED"
  | "DOCUMENTATION"
  | "BENCHMARK"
  | "INVALID";

export interface AddressVerdict {
  address: string;
  family: 4 | 6 | 0;
  class: AddressClass;
  allowed: boolean;
  reason: string;
}

// --- IPv4 ------------------------------------------------------------------

interface V4Range {
  cidr: string;
  cls: AddressClass;
  reason: string;
}

const V4_RANGES: V4Range[] = [
  {
    cidr: "0.0.0.0/8",
    cls: "UNSPECIFIED",
    reason: '"this network" — resolves to local host on many stacks',
  },
  { cidr: "10.0.0.0/8", cls: "PRIVATE", reason: "RFC 1918 private network" },
  {
    cidr: "100.64.0.0/10",
    cls: "CGNAT",
    reason: "RFC 6598 carrier-grade NAT space",
  },
  {
    cidr: "127.0.0.0/8",
    cls: "LOOPBACK",
    reason: "loopback — the server itself",
  },
  // Checked before the broader link-local range so the reason is specific.
  {
    cidr: "169.254.169.254/32",
    cls: "CLOUD_METADATA",
    reason: "cloud instance metadata service (AWS/Azure/GCP/DO)",
  },
  {
    cidr: "168.63.129.16/32",
    cls: "CLOUD_METADATA",
    reason: "Azure platform virtual address",
  },
  {
    cidr: "169.254.170.2/32",
    cls: "CLOUD_METADATA",
    reason: "ECS task metadata endpoint",
  },
  { cidr: "169.254.0.0/16", cls: "LINK_LOCAL", reason: "RFC 3927 link-local" },
  { cidr: "172.16.0.0/12", cls: "PRIVATE", reason: "RFC 1918 private network" },
  {
    cidr: "192.0.0.0/24",
    cls: "RESERVED",
    reason: "IETF protocol assignments",
  },
  {
    cidr: "192.0.2.0/24",
    cls: "DOCUMENTATION",
    reason: "TEST-NET-1 documentation range",
  },
  { cidr: "192.31.196.0/24", cls: "RESERVED", reason: "AS112-v4" },
  { cidr: "192.88.99.0/24", cls: "RESERVED", reason: "6to4 relay anycast" },
  {
    cidr: "192.168.0.0/16",
    cls: "PRIVATE",
    reason: "RFC 1918 private network",
  },
  {
    cidr: "198.18.0.0/15",
    cls: "BENCHMARK",
    reason: "network benchmark range",
  },
  {
    cidr: "198.51.100.0/24",
    cls: "DOCUMENTATION",
    reason: "TEST-NET-2 documentation range",
  },
  {
    cidr: "203.0.113.0/24",
    cls: "DOCUMENTATION",
    reason: "TEST-NET-3 documentation range",
  },
  { cidr: "224.0.0.0/4", cls: "MULTICAST", reason: "multicast" },
  // Ahead of 240.0.0.0/4, which also contains it — the first match wins, so the
  // more specific range has to come first for the reason to be accurate.
  { cidr: "255.255.255.255/32", cls: "BROADCAST", reason: "limited broadcast" },
  { cidr: "240.0.0.0/4", cls: "RESERVED", reason: "reserved for future use" },
];

interface ParsedV4Range {
  base: number;
  mask: number;
  cls: AddressClass;
  reason: string;
}

const PARSED_V4: ParsedV4Range[] = V4_RANGES.map((r) => {
  const [addr, bitsRaw] = r.cidr.split("/");
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
  return {
    base: (v4ToInt(addr!) & mask) >>> 0,
    mask,
    cls: r.cls,
    reason: r.reason,
  };
});

function v4ToInt(address: string): number {
  const parts = address.split(".");
  if (parts.length !== 4) return -1;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return -1;
    value = ((value << 8) | octet) >>> 0;
  }
  return value >>> 0;
}

function classifyV4(address: string): { cls: AddressClass; reason: string } {
  const value = v4ToInt(address);
  if (value < 0) return { cls: "INVALID", reason: "malformed IPv4 address" };
  for (const range of PARSED_V4) {
    if ((value & range.mask) >>> 0 === range.base) {
      return { cls: range.cls, reason: range.reason };
    }
  }
  return { cls: "GLOBAL_UNICAST", reason: "public IPv4 address" };
}

// --- IPv6 ------------------------------------------------------------------

function v6ToBigInt(address: string): bigint | null {
  // Strip a zone index ("fe80::1%eth0") — it is not part of the address.
  const clean = address.split("%")[0]!;

  // An embedded IPv4 tail ("::ffff:127.0.0.1") is expanded to two hex groups.
  const v4Match = clean.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  let text = clean;
  if (v4Match) {
    const v4 = v4ToInt(v4Match[2]!);
    if (v4 < 0) return null;
    const hi = (v4 >>> 16).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    text = `${v4Match[1]}${hi}:${lo}`;
  }

  const doubleColon = text.split("::");
  if (doubleColon.length > 2) return null;

  const head = doubleColon[0]
    ? doubleColon[0].split(":").filter((s) => s !== "")
    : [];
  const tail =
    doubleColon.length === 2 && doubleColon[1]
      ? doubleColon[1].split(":").filter((s) => s !== "")
      : [];

  if (doubleColon.length === 1 && head.length !== 8) return null;
  const fillCount = 8 - head.length - tail.length;
  if (fillCount < 0) return null;

  const groups = [
    ...head,
    ...Array<string>(doubleColon.length === 2 ? fillCount : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function inV6Range(value: bigint, prefix: string, bits: number): boolean {
  const base = v6ToBigInt(prefix);
  if (base === null) return false;
  const shift = BigInt(128 - bits);
  return value >> shift === base >> shift;
}

function classifyV6(address: string): { cls: AddressClass; reason: string } {
  const value = v6ToBigInt(address);
  if (value === null)
    return { cls: "INVALID", reason: "malformed IPv6 address" };

  if (value === 0n)
    return { cls: "UNSPECIFIED", reason: "unspecified address ::" };
  if (value === 1n) return { cls: "LOOPBACK", reason: "IPv6 loopback ::1" };

  // IPv4-mapped and IPv4-translated: re-classify using the embedded v4 address,
  // otherwise ::ffff:127.0.0.1 sails straight through to localhost.
  if (inV6Range(value, "::ffff:0:0", 96)) {
    const v4 = Number(value & 0xffffffffn);
    const dotted = [
      (v4 >>> 24) & 255,
      (v4 >>> 16) & 255,
      (v4 >>> 8) & 255,
      v4 & 255,
    ].join(".");
    const inner = classifyV4(dotted);
    return {
      cls: inner.cls,
      reason: `IPv4-mapped address (${dotted}): ${inner.reason}`,
    };
  }
  if (inV6Range(value, "::", 96))
    return { cls: "RESERVED", reason: "IPv4-compatible transition address" };
  // Deny 6to4 transition addresses even when their embedded IPv4 is public.
  if (inV6Range(value, "2002::", 16)) {
    return { cls: "RESERVED", reason: "6to4 transition address" };
  }
  if (inV6Range(value, "fd00:ec2::254", 128)) {
    return {
      cls: "CLOUD_METADATA",
      reason: "AWS IPv6 instance metadata service",
    };
  }
  if (inV6Range(value, "fe80::", 10))
    return { cls: "LINK_LOCAL", reason: "IPv6 link-local" };
  if (inV6Range(value, "fc00::", 7))
    return { cls: "PRIVATE", reason: "IPv6 unique local address" };
  if (inV6Range(value, "ff00::", 8))
    return { cls: "MULTICAST", reason: "IPv6 multicast" };
  if (inV6Range(value, "2001:db8::", 32)) {
    return { cls: "DOCUMENTATION", reason: "IPv6 documentation range" };
  }
  if (inV6Range(value, "100::", 64))
    return { cls: "RESERVED", reason: "IPv6 discard-only prefix" };
  if (inV6Range(value, "64:ff9b::", 96))
    return { cls: "RESERVED", reason: "NAT64 well-known prefix" };
  if (inV6Range(value, "2001::", 23))
    return { cls: "RESERVED", reason: "IPv6 special-purpose assignments" };
  if (inV6Range(value, "3fff::", 20))
    return { cls: "DOCUMENTATION", reason: "IPv6 documentation range" };
  if (inV6Range(value, "2000::", 3))
    return { cls: "GLOBAL_UNICAST", reason: "public IPv6 address" };
  return { cls: "RESERVED", reason: "not allocated for global unicast" };
}

// --- Public API ------------------------------------------------------------

export function classifyAddress(address: string): AddressVerdict {
  const family = net.isIP(address) as 0 | 4 | 6;

  if (family === 0) {
    return {
      address,
      family: 0,
      class: "INVALID",
      allowed: false,
      reason: "not a valid IP address",
    };
  }

  const { cls, reason } =
    family === 4 ? classifyV4(address) : classifyV6(address);

  return {
    address,
    family,
    class: cls,
    allowed: cls === "GLOBAL_UNICAST",
    reason,
  };
}

export function isPubliclyRoutable(address: string): boolean {
  return classifyAddress(address).allowed;
}
