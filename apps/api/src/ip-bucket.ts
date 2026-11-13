/**
 * The key that a limit counts an address under. An IPv4 address counts alone. A visitor on IPv6 owns a whole /64 prefix of
 * addresses, so counting the full address would let one caller rotate its address for every try. The first four groups name
 * the prefix, and an IPv4 address inside an IPv6 one counts as that IPv4 address.
 */
export function ipBucket(address: string): string {
  const value = address.trim().toLowerCase();
  if (!value.includes(":")) return value;
  const mapped = value.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (value.includes(".")) return value;
  const halves = value.split("::");
  if (halves.length > 2) return value;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return value;
  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return value;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}
