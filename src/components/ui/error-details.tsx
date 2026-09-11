'use client';

/**
 * Shows what actually went wrong. `digest` is the hash Next.js also writes to
 * the server log, so a user can quote it and the matching entry can be found.
 */
export function ErrorDetails({ error }: { error: Error & { digest?: string } }) {
  const message = error?.message?.trim();
  if (!message && !error?.digest) return null;

  return (
    <details className="mt-4 text-left">
      <summary className="cursor-pointer text-sm font-medium text-ink-soft">
        รายละเอียดข้อผิดพลาด (สำหรับแจ้งผู้พัฒนา)
      </summary>
      <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-canvas px-3 py-2">
        {message ? (
          <p className="break-words font-mono text-xs leading-5 text-ink">{message}</p>
        ) : null}
        {error.digest ? (
          <p className="font-mono text-xs text-muted">digest: {error.digest}</p>
        ) : null}
      </div>
    </details>
  );
}
