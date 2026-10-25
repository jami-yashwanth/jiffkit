import type { Runner } from '../form';

const toInt = (ip: string): number | undefined => {
  const p = ip.split('.');
  if (p.length !== 4 || p.some((o) => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return undefined;
  return p.reduce((n, o) => n * 256 + Number(o), 0);
};
const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** The prefix length of a netmask, or undefined if its 1 bits are not contiguous. */
export function prefixOf(mask: number): number | undefined {
  for (let p = 0; p <= 32; p++) if (maskOf(p) === mask) return p;
  return undefined;
}

function kind(n: number): string {
  const inRange = (base: string, bits: number) => (n & maskOf(bits)) >>> 0 === toInt(base);
  if (inRange('10.0.0.0', 8) || inRange('172.16.0.0', 12) || inRange('192.168.0.0', 16)) return 'Private (RFC 1918)';
  if (inRange('127.0.0.0', 8)) return 'Loopback';
  if (inRange('169.254.0.0', 16)) return 'Link-local';
  if (inRange('100.64.0.0', 10)) return 'Shared address space (carrier-grade NAT)';
  if (inRange('224.0.0.0', 4)) return 'Multicast';
  if (inRange('240.0.0.0', 4)) return 'Reserved';
  return 'Public';
}

export function subnet(input: string): [string, string][] | string {
  const m = /^\s*([\d.]+)\s*(?:\/\s*(\d{1,2})|\s+([\d.]+))?\s*$/.exec(input);
  if (!m) return 'Type an address with a prefix (192.168.1.10/24) or a netmask (10.0.0.1 255.255.252.0).';
  const ip = toInt(m[1]);
  if (ip === undefined) return `“${m[1]}” is not an IPv4 address: it needs four numbers from 0 to 255.`;
  let prefix: number | undefined;
  if (m[2] !== undefined) {
    prefix = Number(m[2]);
    if (prefix > 32) return 'The prefix must be between /0 and /32.';
  } else if (m[3] !== undefined) {
    const mask = toInt(m[3]);
    if (mask === undefined) return `“${m[3]}” is not a netmask.`;
    prefix = prefixOf(mask);
    if (prefix === undefined) return `“${m[3]}” is not a valid netmask: its 1 bits must come first, without gaps.`;
  } else return 'Add a prefix such as /24, or a netmask after the address.';

  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const total = 2 ** (32 - prefix);
  const [first, last, usable] =
    prefix === 32 ? [network, network, 1] : prefix === 31 ? [network, broadcast, 2] : [network + 1, broadcast - 1, total - 2];
  const n = (v: number) => v.toLocaleString('en');
  return [
    ['Network', `${toIp(network)}/${prefix}`],
    ['Netmask', toIp(mask)],
    ['Wildcard mask', toIp(~mask >>> 0)],
    ['Broadcast', prefix >= 31 ? '(none)' : toIp(broadcast)],
    ['First host', toIp(first)],
    ['Last host', toIp(last)],
    ['Usable hosts', n(usable)],
    ['Total addresses', n(total)],
    ['Type', kind(ip)],
  ];
}

export const run: Runner = ({ input }) => {
  const s = String(input);
  if (!s.trim()) return {};
  const r = subnet(s);
  return typeof r === 'string' ? { error: r } : { out: { details: { rows: r } } };
};
