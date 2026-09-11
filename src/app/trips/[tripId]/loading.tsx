import { SkeletonCard } from '@/components/ui/states';

export default function TripLoading() {
  return (
    <div className="space-y-3">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  );
}
