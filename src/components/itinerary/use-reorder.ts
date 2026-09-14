'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How close to an edge the finger has to get before the page starts moving. */
const TOP_EDGE = 88;
/** Larger at the bottom: the fixed navigation and the floating button live there. */
const BOTTOM_EDGE = 150;
const MAX_SPEED = 22;

/**
 * Press-and-drag reordering that works with a finger.
 *
 * HTML5 drag and drop never fires on touch screens, so this tracks pointer
 * events instead: the list reorders live under the finger and the new order is
 * committed once, on release.
 *
 * The listeners live on the window rather than on the grip. Reordering moves
 * the grip's DOM node, and moving a node releases its pointer capture — so a
 * captured grip stops receiving moves after the very first swap.
 *
 * A list taller than the screen also needs the page to move: without that you
 * can only drop a card somewhere already on screen, which on a long day means
 * you cannot reorder at all. Holding near an edge scrolls, and the drop target
 * is recomputed as the cards slide past.
 */
export function useReorder(ids: readonly string[], onCommit: (ids: string[]) => void) {
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const live = useRef<{ id: string; order: string[]; original: string[] } | null>(null);
  const pointerY = useRef(0);

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  const start = useCallback(
    (id: string, event: React.PointerEvent) => {
      event.preventDefault();
      pointerY.current = event.clientY;
      live.current = { id, order: [...ids], original: [...ids] };
      setDrag({ id, order: [...ids] });
    },
    [ids],
  );

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;

    /** Moves the dragged card to wherever the finger currently is. */
    function reposition() {
      const current = live.current;
      if (!current) return;

      // The target slot is the first card whose midpoint the pointer is above.
      let target = current.order.length - 1;
      for (const [index, id] of current.order.entries()) {
        const rect = elements.current.get(id)?.getBoundingClientRect();
        if (!rect) continue;
        if (pointerY.current < rect.top + rect.height / 2) {
          target = index;
          break;
        }
      }

      const from = current.order.indexOf(current.id);
      if (from === -1 || from === target) return;

      const order = [...current.order];
      order.splice(from, 1);
      order.splice(target, 0, current.id);
      live.current = { ...current, order };
      setDrag({ id: current.id, order });
    }

    function handleMove(event: PointerEvent) {
      if (!live.current) return;
      event.preventDefault();
      pointerY.current = event.clientY;
      reposition();
    }

    let frame = requestAnimationFrame(function step() {
      const bottom = window.innerHeight - BOTTOM_EDGE;
      let delta = 0;
      if (pointerY.current < TOP_EDGE) {
        delta = -Math.min(MAX_SPEED, Math.ceil((TOP_EDGE - pointerY.current) / 4));
      } else if (pointerY.current > bottom) {
        delta = Math.min(MAX_SPEED, Math.ceil((pointerY.current - bottom) / 4));
      }

      if (delta !== 0) {
        const before = window.scrollY;
        window.scrollBy(0, delta);
        // Only worth recomputing when the page actually moved — at either end
        // of the document scrollBy is a no-op and the cards have not shifted.
        if (window.scrollY !== before) reposition();
      }
      frame = requestAnimationFrame(step);
    });

    function handleEnd() {
      const current = live.current;
      live.current = null;
      setDrag(null);
      if (current && current.order.join() !== current.original.join()) {
        onCommit(current.order);
      }
    }

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [dragging, onCommit]);

  return {
    /** The order to render right now: the live preview while dragging. */
    order: drag ? drag.order : ids,
    draggingId: drag?.id ?? null,
    register,
    start,
  };
}
