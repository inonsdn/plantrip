import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full, pattern);
    return pattern.test(entry) ? [full] : [];
  });
}

const migrations = sourceFiles('supabase/migrations', /\.sql$/)
  .sort()
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const PER_ROW_HELPERS = /(is_active_trip_member|is_trip_owner|shares_active_trip_with)\s*\(/;

/**
 * A policy written as `helper(trip_id)` takes the row's own column, so the
 * planner has to run it once per candidate row — and a SECURITY DEFINER
 * function can never be inlined, so each of those is a real function call that
 * re-reads trip_members and re-parses the JWT claims through auth.uid().
 *
 * Measured on this schema with 403 trips, 12 of them mine: 403 helper calls and
 * 1,416 buffer reads to return 12 rows. The set form below is evaluated once
 * per query as a hashed SubPlan: 1 call, 392 buffers.
 */
describe('row level security is evaluated once per query, not once per row', () => {
  const rewriteIndex = migrations.findIndex((file) =>
    file.path.includes('20240101001400_rls_performance'),
  );

  it('the rewrite migration exists', () => {
    expect(rewriteIndex).toBeGreaterThan(-1);
  });

  it('no policy written from the rewrite onwards calls a helper with a column', () => {
    const offenders: string[] = [];
    for (const file of migrations.slice(rewriteIndex)) {
      // Statements, roughly: enough to tell a create policy from everything else.
      for (const statement of file.source.split(/;\s*\n/)) {
        if (!/create\s+policy/i.test(statement)) continue;
        if (PER_ROW_HELPERS.test(statement)) {
          offenders.push(`${file.path}: ${statement.trim().split('\n')[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * GoTrue writes auth.users on sign in and on every token refresh. A trigger
 * that fires on UPDATE as well as INSERT turned each of those into an upsert
 * against public.profiles, which always writes a new row version even when
 * nothing changed — WAL, a dead tuple and an updated_at trigger, for a row that
 * was already correct. /auth/callback keeps name and avatar fresh instead.
 */
describe('the auth.users trigger only fires on insert', () => {
  it('the final trigger definition has no "or update"', () => {
    const definitions = migrations
      .flatMap((file) => file.source.split(/;\s*\n/))
      .filter((statement) => /create\s+trigger\s+on_auth_user_created/i.test(statement));

    expect(definitions.length).toBeGreaterThan(0);
    const last = definitions[definitions.length - 1];
    expect(last).toMatch(/after\s+insert\s+on\s+auth\.users/i);
    expect(last).not.toMatch(/or\s+update/i);
  });
});

/**
 * An expected outcome must not be raised.
 *
 * pg_stat_statements does not record a statement that raises — only the
 * PostgREST pre-request that preceded it. A client that retried a raising RPC
 * therefore appeared in the statistics as tens of millions of set_config calls
 * against a single-digit call count for the function itself, and every one of
 * those left an aborted transaction on a pooled connection.
 */
describe('a dead invite link is answered, not raised', () => {
  const join = migrations
    .filter((file) => /create or replace function public\.join_trip_by_token/i.test(file.source))
    .at(-1);

  it('join_trip_by_token is defined', () => {
    expect(join).toBeDefined();
  });

  it('an unknown token returns null instead of raising', () => {
    const body = join!.source;
    expect(body).toMatch(/if v_trip_id is null then\s*\n\s*return null;/i);
    expect(body).not.toMatch(/if v_trip_id is null then[\s\S]{0,120}raise exception/i);
  });
});

const clientFiles = sourceFiles('src', /\.tsx?$/)
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
  .filter(({ source }) => /^['"]use client['"]/m.test(source));

/**
 * The join page runs its server action from an effect, with no click behind it.
 * It used to clear its own "already attempted" guard on failure so that a later
 * run of the effect would try again — with nothing pacing the retries and a
 * failure that could never resolve itself. One attempt per explicit retry is
 * the only safe shape for an automatic call.
 */
describe('an automatic server action never re-arms itself on failure', () => {
  const joinTrip = clientFiles.find((file) => file.path.endsWith('join-trip.tsx'));

  it('the join component is a client component', () => {
    expect(joinTrip).toBeDefined();
  });

  it('the attempt guard is only ever set to the current retry key', () => {
    const assignments = [...joinTrip!.source.matchAll(/attempted\.current\s*=(?!=)\s*([^;]+);/g)].map(
      (match) => match[1].trim(),
    );
    expect(assignments).toEqual(['retryKey']);
  });
});
