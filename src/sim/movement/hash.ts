const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function forEachUtf8Byte(value: string, consume: (byte: number) => void): void {
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      consume(codePoint);
    } else if (codePoint <= 0x7ff) {
      consume(0xc0 | (codePoint >>> 6));
      consume(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      consume(0xe0 | (codePoint >>> 12));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    } else {
      consume(0xf0 | (codePoint >>> 18));
      consume(0x80 | ((codePoint >>> 12) & 0x3f));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    }
  }
}

export function hashMovementString(value: string): string {
  let hash = FNV64_OFFSET;
  forEachUtf8Byte(value, (byte) => {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  });
  return hash.toString(16).padStart(16, '0');
}

