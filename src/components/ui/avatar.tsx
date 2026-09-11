/* eslint-disable @next/next/no-img-element */

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return [...trimmed][0].toUpperCase();
}

export function MemberAvatar({
  name,
  avatarUrl,
  size = 'md',
  dimmed = false,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  dimmed?: boolean;
}) {
  const sizeClass = size === 'sm' ? 'size-6 text-[10px]' : size === 'lg' ? 'size-11 text-base' : 'size-8 text-xs';
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-brand-soft font-semibold text-brand-strong ${sizeClass} ${
    dimmed ? 'opacity-60 grayscale' : ''
  }`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <span aria-hidden className={base}>
      {initials(name)}
    </span>
  );
}

export function MemberChip({
  name,
  avatarUrl,
  removed = false,
}: {
  name: string;
  avatarUrl?: string | null;
  removed?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-canvas px-1.5 py-0.5 text-xs text-ink">
      <MemberAvatar name={name} avatarUrl={avatarUrl} size="sm" dimmed={removed} />
      <span className="truncate">{name}</span>
      {removed ? <span className="text-muted">(ออกแล้ว)</span> : null}
    </span>
  );
}
