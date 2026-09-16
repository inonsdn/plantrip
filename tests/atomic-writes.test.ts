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

const WRITE = /\.from\('([a-z_]+)'\)\s*\n?\s*\.(insert|update|upsert|delete)/g;
const RPC = /\.rpc\('([a-z_]+)'/g;

interface Action {
  file: string;
  name: string;
  writes: string[];
}

function actions(): Action[] {
  const found: Action[] = [];
  for (const file of sourceFiles('src/lib/actions', /\.ts$/)) {
    const source = readFileSync(file, 'utf8');
    const parts = source.split(/\nexport async function (\w+)/);
    for (let index = 1; index < parts.length; index += 2) {
      const body = parts[index + 1];
      const writes = [
        ...[...body.matchAll(WRITE)].map((match) => `${match[1]}.${match[2]}`),
        ...[...body.matchAll(RPC)].map((match) => `rpc:${match[1]}`),
      ];
      found.push({ file, name: parts[index], writes });
    }
  }
  return found;
}

/**
 * A Next.js server action is not a transaction. Each Supabase call is its own
 * PostgREST request, so an action that writes twice can fail halfway: the first
 * write stays, the caller is told it failed, and the two disagree from then on.
 *
 * That is not theoretical. Saving a place did three writes — bump the day's
 * version, update the place, upsert the journey out of it — and when the third
 * failed the version had already moved and the place was already saved, while
 * the queue rolled the change off the screen. Every one of them is a single
 * database function now.
 *
 * A write that is genuinely independent of the outcome may follow a successful
 * one (remembering an exchange rate, say). Two writes that have to agree may
 * not.
 */
describe('no action writes to the database twice', () => {
  const ALLOWED_SECOND_WRITE: Record<string, string> = {
    // Convenience only, and deliberately after the expense is safely stored:
    // the next entry defaults to this rate. Losing it costs nothing.
    saveExpenseAction: 'trip_currencies.upsert',
  };

  it('finds the actions to check', () => {
    expect(actions().length).toBeGreaterThan(10);
  });

  it.each(actions().filter((action) => action.writes.length > 0))(
    '$name writes once',
    (action) => {
      const allowed = ALLOWED_SECOND_WRITE[action.name];
      const counted = allowed
        ? action.writes.filter((write) => write !== allowed)
        : action.writes;

      expect(counted, `${action.name} → ${action.writes.join(' + ')}`).toHaveLength(1);
    },
  );
});

const migrations = sourceFiles('supabase/migrations', /\.sql$/).sort();
const reconciliation = readFileSync(
  'supabase/migrations/20240101001800_atomic_writes.sql',
  'utf8',
);

/**
 * A column added to a table after it was created can be missing from a database
 * that was set up earlier, and nothing in the app notices: `select('*')` returns
 * the row without it, so reads look fine, and only a write fails — with
 * PGRST204, which said nothing useful until recently.
 *
 * Every such change is re-applied idempotently in the reconciliation migration,
 * so a database that is behind catches up on the next deploy.
 */
describe('every late schema change can be re-applied', () => {
  const lateChanges = migrations
    .filter((file) => !file.includes('20240101001800'))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/add column\s+(?:if not exists\s+)?([a-z_]+)/g)].map(
        (match) => match[1],
      );
    });

  it('finds the columns that were added later', () => {
    expect(lateChanges).toContain('notes');
    expect(lateChanges.length).toBeGreaterThan(3);
  });

  it.each([...new Set(lateChanges)])('%s is re-applied idempotently', (column) => {
    expect(reconciliation).toMatch(
      new RegExp(`add column if not exists ${column}\\b`),
    );
  });

  it('re-applies the transport modes added later', () => {
    for (const mode of ['flight', 'train', 'ferry', 'taxi']) {
      expect(reconciliation).toContain(`add value if not exists '${mode}'`);
    }
  });
});
