import { BlockList, isIP } from 'node:net';

import { err, forbidden, ok } from '@lawyer-152fz/core';
import type { ForbiddenError, Result } from '@lawyer-152fz/core';

/**
 * Какие IP-адреса сканер может загружать (SSRF-защита, ADR-0006).
 *
 * - Частные сети (localhost, 10/8, 192.168/16, ULA и т. п.) — только при `allowPrivateNetworks: true`:
 *   в плагине пользователь проверяет свой dev-сервер, в боте флаг выключен.
 * - Служебные адреса запрещены всегда: link-local с сервисом метаданных облака (169.254.169.254),
 *   multicast, «этот хост», зарезервированные и документационные диапазоны.
 */
export interface AddressPolicyOptions {
  readonly allowPrivateNetworks: boolean;
}

export type AddressPolicy = (address: string) => Result<void, ForbiddenError>;

function blockList(ranges: readonly (readonly [string, number, 'ipv4' | 'ipv6'])[]): BlockList {
  const list = new BlockList();
  for (const [network, prefix, family] of ranges) list.addSubnet(network, prefix, family);
  return list;
}

const ALWAYS_BLOCKED = blockList([
  ['0.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
  // Teredo прячет IPv4 в обфусцированном виде — проверить нельзя, поэтому запрещаем.
  ['2001::', 32, 'ipv6'],
  // Сервис метаданных AWS по IPv6 лежит в ULA-диапазоне, который иначе считался бы частной сетью.
  ['fd00:ec2::254', 128, 'ipv6'],
]);

const PRIVATE = blockList([
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['::1', 128, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
]);

/** Восемь 16-битных групп IPv6, включая форму с IPv4 в конце (`::ffff:1.2.3.4`). */
function ipv6Groups(address: string): number[] {
  let text = address.toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted[1].split('.').map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const parse = (part: string) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/** IPv4, спрятанный в IPv6: IPv4-mapped (`::ffff:0:0/96`), NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`). */
function embeddedIpv4(address: string): string | undefined {
  const g = ipv6Groups(address);
  const v4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  const zeros = (from: number, to: number) => g.slice(from, to).every((group) => group === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return v4(g[6] ?? 0, g[7] ?? 0);
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return v4(g[6] ?? 0, g[7] ?? 0);
  if (g[0] === 0x2002) return v4(g[1] ?? 0, g[2] ?? 0);
  return undefined;
}

export function createAddressPolicy(options: AddressPolicyOptions): AddressPolicy {
  return function check(address) {
    const family = isIP(address);
    if (family === 0) return err(forbidden(`«${address}» — не IP-адрес`));

    if (family === 6) {
      const v4 = embeddedIpv4(address);
      if (v4 !== undefined) return check(v4);
    }

    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (ALWAYS_BLOCKED.check(address, type)) {
      return err(
        forbidden(`адрес ${address} служебный (link-local, метаданные облака или резерв)`),
      );
    }
    if (!options.allowPrivateNetworks && PRIVATE.check(address, type)) {
      return err(forbidden(`адрес ${address} относится к частной сети`));
    }
    return ok(undefined);
  };
}
