'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, LoaderCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { buildSharePlan, type SharePlanInput } from '@/lib/itinerary/share-plan';
import { renderSharePoster } from '@/lib/itinerary/share-poster';

/** `ทริปเกาหลี 2026` -> `tripmate-ทริปเกาหลี-2026.png` */
export function posterFileName(title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/g, '-')
    // `\p{M}` matters: Thai vowels and tone marks are combining marks, not
    // letters, so dropping them turns ทริป into ทรป.
    .replace(/[^\p{L}\p{M}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
  return `tripmate-${slug === '' ? 'trip' : slug}.png`;
}

type Poster = { url: string; blob: Blob; name: string };

/**
 * Turns the whole trip into one picture.
 *
 * The file is built in the browser and never leaves it until somebody chooses
 * where it goes: nothing is uploaded, and the picture carries no invite link,
 * so sharing the plan does not hand anyone a way into the trip.
 */
export function SharePlanButton({ input }: { input: SharePlanInput }) {
  const { showToast } = useToast();
  const [working, setWorking] = useState(false);
  const [poster, setPoster] = useState<Poster | null>(null);

  // Revoking on close would pull the image out from under a sheet that is still
  // animating, so the previous URL is released only once a new one replaces it.
  const live = useRef<string | null>(null);
  useEffect(() => {
    live.current = poster?.url ?? null;
  }, [poster]);
  useEffect(() => () => {
    if (live.current) URL.revokeObjectURL(live.current);
  }, []);

  const generate = useCallback(async () => {
    setWorking(true);
    try {
      const plan = buildSharePlan(input);
      const image = await renderSharePoster(plan);
      const url = URL.createObjectURL(image.blob);
      setPoster((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return { url, blob: image.blob, name: posterFileName(plan.title) };
      });
    } catch (error) {
      console.error(error);
      showToast({
        message: error instanceof Error ? error.message : 'สร้างรูปไม่สำเร็จ',
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }, [input, showToast]);

  function save(current: Poster) {
    const anchor = document.createElement('a');
    anchor.href = current.url;
    anchor.download = current.name;
    anchor.click();
  }

  async function share(current: Poster) {
    const file = new File([current.blob], current.name, { type: 'image/png' });
    // Not every browser can send a file to the share sheet; the ones that
    // cannot still have the save button beside this one.
    if (!navigator.canShare?.({ files: [file] })) {
      save(current);
      return;
    }
    try {
      await navigator.share({ files: [file], title: input.tripName });
    } catch (error) {
      // Dismissing the share sheet is not a failure worth a message.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast({ message: 'แชร์ไม่สำเร็จ ลองบันทึกรูปแทน', tone: 'error' });
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={generate}
        disabled={working || input.days.length === 0}
        title="แชร์แผนทั้งทริปเป็นรูป"
        className="shrink-0"
      >
        {working ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <ImageIcon aria-hidden className="size-4" />
        )}
        {/* The label folds away on the narrowest phones, where the row has to
            share its width with the day summary; the name stays for a reader. */}
        <span className="sr-only xs:not-sr-only">
          {working ? 'กำลังสร้างรูป…' : 'แชร์เป็นรูป'}
        </span>
      </Button>

      <Sheet
        open={poster !== null}
        onClose={() => setPoster(null)}
        title="แผนการเดินทางทั้งทริป"
        description="บันทึกรูปนี้ หรือส่งต่อให้เพื่อนร่วมทริปได้เลย"
        size="lg"
        footer={
          poster ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => save(poster)}
              >
                <Download aria-hidden className="size-4" />
                บันทึกรูป
              </Button>
              <Button type="button" className="flex-1" onClick={() => share(poster)}>
                <Share2 aria-hidden className="size-4" />
                แชร์
              </Button>
            </div>
          ) : null
        }
      >
        {poster ? (
          // A blob built in this browser: there is nothing for the image
          // optimiser to fetch, and its size is only known at runtime.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster.url}
            alt={`แผนการเดินทางของ ${input.tripName}`}
            className="w-full rounded-xl border border-line"
          />
        ) : null}
      </Sheet>
    </>
  );
}
