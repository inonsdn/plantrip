import { describe, expect, it, vi } from 'vitest';

/**
 * requestOrigin() reads next/headers, so the module is stubbed and the helper
 * re-imported per case.
 */
async function originWith(
  headerEntries: Record<string, string>,
  env: Record<string, string | undefined> = {},
): Promise<string> {
  vi.resetModules();
  vi.doMock('server-only', () => ({}));
  vi.doMock('next/headers', () => ({
    headers: async () => ({ get: (name: string) => headerEntries[name.toLowerCase()] ?? null }),
  }));

  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    const { requestOrigin } = await import('@/lib/request-origin');
    return await requestOrigin();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEAN_ENV = {
  NEXT_PUBLIC_SITE_URL: undefined,
  SITE_URL: undefined,
  VERCEL_PROJECT_PRODUCTION_URL: undefined,
  VERCEL_URL: undefined,
};

describe('requestOrigin', () => {
  it('uses the custom domain the visitor is actually on', async () => {
    expect(
      await originWith(
        { 'x-forwarded-host': 'plantrip.nonsdn.com', 'x-forwarded-proto': 'https' },
        CLEAN_ENV,
      ),
    ).toBe('https://plantrip.nonsdn.com');
  });

  it('never falls back to the per-deployment URL when a request host exists', async () => {
    // The regression: VERCEL_URL is behind Deployment Protection, so an invite
    // built from it shows Vercel's login page instead of the app.
    const origin = await originWith(
      { 'x-forwarded-host': 'plantrip.nonsdn.com', 'x-forwarded-proto': 'https' },
      { ...CLEAN_ENV, VERCEL_URL: 'plantrip-git-main-nonsdn.vercel.app' },
    );
    expect(origin).toBe('https://plantrip.nonsdn.com');
    expect(origin).not.toContain('vercel.app');
  });

  it('prefers the stable production domain over the deployment URL', async () => {
    expect(
      await originWith({}, {
        ...CLEAN_ENV,
        VERCEL_PROJECT_PRODUCTION_URL: 'plantrip-beta.vercel.app',
        VERCEL_URL: 'plantrip-git-main-nonsdn.vercel.app',
      }),
    ).toBe('https://plantrip-beta.vercel.app');
  });

  it('honours an explicit SITE_URL when there is no request host', async () => {
    expect(
      await originWith({}, { ...CLEAN_ENV, SITE_URL: 'https://trips.example.com/' }),
    ).toBe('https://trips.example.com');
  });

  it('falls back to plain http for localhost', async () => {
    expect(await originWith({ host: 'localhost:3000' }, CLEAN_ENV)).toBe('http://localhost:3000');
  });

  it('uses host when x-forwarded-host is absent', async () => {
    expect(
      await originWith({ host: 'plantrip.nonsdn.com' }, CLEAN_ENV),
    ).toBe('https://plantrip.nonsdn.com');
  });
});
