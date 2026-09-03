"use client";

import { useCallback, useRef } from "react";

interface LongPressOptions {
  delay?: number;
  onLongPress: (e: TouchEvent) => void;
  onCancel?: () => void;
}

/**
 * Detects long-press on touch devices without interfering with
 * normal taps, scrolling, or double-taps.
 *
 * - Cancels if finger moves > 10px
 * - Cancels on touch end before delay
 * - Only fires on touchstart/touchend (not mouse) to avoid desktop interference
 */
export function useLongPress({
  delay = 500,
  onLongPress,
  onCancel,
}: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
    fired.current = false;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      clear();
      fired.current = false;
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };

      timerRef.current = setTimeout(() => {
        fired.current = true;
        // Dispatch a synthetic-like event — we pass the original touch info
        onLongPress(e.nativeEvent as unknown as TouchEvent);
      }, delay);
    },
    [delay, onLongPress, clear],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startPos.current.x);
      const dy = Math.abs(touch.clientY - startPos.current.y);
      // Cancel if finger moved more than 10px (prevents triggering during scroll)
      if (dx > 10 || dy > 10) {
        clear();
        onCancel?.();
      }
    },
    [clear, onCancel],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (fired.current) {
        // Long press already fired — prevent the subsequent tap
        e.preventDefault();
      }
      clear();
    },
    [clear],
  );

  const onTouchCancel = useCallback(() => {
    clear();
    onCancel?.();
  }, [clear, onCancel]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
