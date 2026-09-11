import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TopBar } from '@/components/nav/top-bar';
import { TripShell } from '@/components/trip/trip-shell';
import { requireUser } from '@/lib/auth';
import { getTripContext } from '@/lib/queries/trips';
import { siteUrl } from '@/lib/supabase/env';

export async function generateMetadata({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const context = await getTripContext(tripId);
  return { title: context?.trip.name ?? 'ทริป' };
}

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser(`/trips/${tripId}`);

  const context = await getTripContext(tripId);
  // Missing trip and "not a member" look identical on purpose.
  if (!context) notFound();

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <Suspense>
        <TripShell context={context} inviteBaseUrl={siteUrl()}>
          {children}
        </TripShell>
      </Suspense>
    </div>
  );
}
