import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUuidV4, uuid } from '@/lib/uuid';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The three ways a browser can leave us, from best to worst. */
const sources = {
  'crypto.randomUUID': undefined,
  'crypto.getRandomValues': { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) },
  'no crypto at all': null,
} as const;

describe('every id is a real v4 UUID', () => {
  for (const [name, replacement] of Object.entries(sources)) {
    describe(`with ${name}`, () => {
      function use() {
        if (replacement !== undefined) vi.stubGlobal('crypto', replacement);
      }

      it('has the canonical shape', () => {
        use();
        for (let index = 0; index < 100; index += 1) {
          const value = uuid();
          expect(isUuidV4(value), value).toBe(true);
          // What the database column and the zod schema will accept, exactly.
          expect(value).toHaveLength(36);
        }
      });

      it('does not repeat itself', () => {
        use();
        const seen = new Set<string>();
        for (let index = 0; index < 5_000; index += 1) seen.add(uuid());
        expect(seen.size).toBe(5_000);
      });
    });
  }

  it('rejects the shapes that are merely unique-looking', () => {
    // What the fallback used to produce, and what the stop id column would
    // have refused.
    expect(isUuidV4('1700000000000-k3f9a2')).toBe(false);
    expect(isUuidV4('optimistic:1700000000000:k3f9a2')).toBe(false);
    expect(isUuidV4('')).toBe(false);
    // A v1 UUID is a UUID but not the version we mint.
    expect(isUuidV4('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false);
  });
});
