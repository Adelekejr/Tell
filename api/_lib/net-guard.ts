import { isIP } from 'node:net';

/**
 * Which addresses Tell's page fetcher may connect to. Only ordinary public
 * internet addresses: never this machine, a private network, link-local
 * (including cloud metadata at 169.254.169.254), multicast or reserved space.
 */

const V4_BLOCKED: readonly [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return false;
  return !V4_BLOCKED.some(([base, bits]) => {
    const b = v4ToInt(base) as number;
    const size = 2 ** (32 - bits);
    return n >= b && n < b + size;
  });
}

/** Expands an IPv6 address to eight 16-bit numbers. Null when malformed. */
export function expandV6(input: string): number[] | null {
  let ip = (input.split('%')[0] ?? '').toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4) {
    const n = v4ToInt(v4[1] as string);
    if (n === null) return null;
    ip = `${ip.slice(0, -(v4[1] as string).length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const out: number[] = [];
  for (const g of [...head, ...Array<string>(fill).fill('0'), ...rest]) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isPublicV6(ip: string): boolean {
  const h = expandV6(ip);
  if (!h) return false;
  const [a = 0, b = 0] = h;
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return false; // ::
  if (zeros(0, 7) && h[7] === 1) return false; // ::1
  if (zeros(0, 5) && h[5] === 0xffff) return isPublicV4(v4Of(h[6] ?? 0, h[7] ?? 0)); // IPv4-mapped
  if (zeros(0, 6)) return false; // IPv4-compatible (deprecated)
  if (a === 0x64 && b === 0xff9b && zeros(2, 6)) return isPublicV4(v4Of(h[6] ?? 0, h[7] ?? 0)); // NAT64
  if (a === 0x2002) return isPublicV4(v4Of(b, h[2] ?? 0)); // 6to4
  if (a === 0x2001 && b === 0) return false; // Teredo
  if (a === 0x2001 && b === 0xdb8) return false; // documentation
  if (a === 0x100 && zeros(1, 4)) return false; // discard
  if ((a & 0xfe00) === 0xfc00) return false; // unique local (incl. fd00:ec2::254 metadata)
  if ((a & 0xffc0) === 0xfe80 || (a & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((a & 0xff00) === 0xff00) return false; // multicast
  return (a & 0xe000) === 0x2000; // only global unicast 2000::/3
}

/** True only for an ordinary public internet address. */
export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip.split('%')[0] ?? '');
  if (kind === 4) return isPublicV4(ip);
  if (kind === 6) return isPublicV6(ip);
  return false;
}

/** Host names that only ever mean "inside": blocked before any DNS lookup. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.home.arpa') ||
    h === 'metadata' ||
    !h.includes('.')
  );
}

/**
 * LOCAL DEVELOPMENT ONLY. Some sandboxes answer every DNS lookup with a fake
 * address in 198.18.0.0/15 and tunnel the connection out. TELL_DEV_FAKE_IP_DNS=1
 * lets the dev server use those addresses. Ignored on Vercel and in production.
 */
export function devFakeIpAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.TELL_DEV_FAKE_IP_DNS === '1' && !env.VERCEL && !env.VERCEL_ENV && env.NODE_ENV !== 'production';
}

export function isFakeIpRange(ip: string): boolean {
  const m = /^198\.(18|19)\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return Boolean(m && Number(m[2]) <= 255 && Number(m[3]) <= 255);
}
