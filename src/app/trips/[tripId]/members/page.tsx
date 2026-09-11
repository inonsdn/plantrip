import { notFound } from 'next/navigation';
import { MembersPanel } from '@/components/trip/members-panel';
import { getTripContext } from '@/lib/queries/trips';

export const metadata = { title: 'สมาชิก' };

export default async function TripMembersPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const context = await getTripContext(tripId);
  if (!context) notFound();

  return <MembersPanel context={context} />;
}
