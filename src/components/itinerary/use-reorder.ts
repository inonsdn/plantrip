'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 */
export function useReorder(ids: readonly string[], onCommit: (ids: string[]) => void) {
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const live = useRef<{ id: string; order: string[]; original: string[] } | null>(null);

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  const start = useCallback(
    (id: string, event: React.PointerEvent) => {
      event.preventDefault();
      live.current = { id, order: [...ids], original: [...ids] };
      setDrag({ id, order: [...ids] });
    },
    [ids],
  );

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;

    function handleMove(event: PointerEvent) {
      const current = live.current;
      if (!current) return;
      event.preventDefault();

      // The target slot is the first card whose midpoint the pointer is above.
      let target = current.order.length - 1;
      for (const [index, id] of current.order.entries()) {
        const rect = elements.current.get(id)?.getBoundingClientRect();
        if (!rect) continue;
        if (event.clientY < rect.top + rect.height / 2) {
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
