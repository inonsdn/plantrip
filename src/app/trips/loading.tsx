import { SkeletonCard } from '@/components/ui/states';

export default function TripsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="h-7 w-40 animate-pulse rounded bg-line" />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  );
}
