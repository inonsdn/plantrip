/**
 * A version 4 UUID, always.
 *
 * Both ids the itinerary queue hands out end up somewhere that will not take
 * anything else: the change id is written to storage and read back, and an
 * added place's id becomes the primary key of its row, checked by a
 * `z.string().uuid()` schema on the way in and stored in a `uuid` column.
 *
 * `crypto.randomUUID` is only defined in a secure context, so it cannot be the
 * whole answer — an http origin, or an older Safari, would have thrown. Both
 * fallbacks below produce a real v4, not something merely unique-looking.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True for a canonical v4 UUID, which is the only shape anything here accepts. */
export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

function format(bytes: Uint8Array): string {
  // Version 4, variant 1, per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (const byte of bytes) hex.push(byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function uuid(): string {
  const source = globalThis.crypto;

  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (source && typeof source.getRandomValues === 'function') {
    source.getRandomValues(bytes);
    return format(bytes);
  }

  // Nothing cryptographic available at all. Still a valid v4: these ids only
  // ever have to be unique, never unguessable — a stop id is meaningless
  // without membership of the trip it hangs from.
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return format(bytes);
}
