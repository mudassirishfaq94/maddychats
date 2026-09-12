"use client";

import { useCallback, useRef } from "react";

interface LongPressTouchableProps {
  onLongPress: () => void;
  children: React.ReactNode;
  className?: string;
  /** Whether long-press is enabled (default: true on touch devices) */
  enabled?: boolean;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

/**
 * Wrapper that adds long-press detection via touch events.
 * Only active on touch devices. Desktop/click behavior is unchanged.
 */
export function LongPressTouchable({
  onLongPress,
  children,
  className,
  enabled = true,
  onSwipeRight,
  onSwipeLeft,
}: LongPressTouchableProps) {
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

  const cancelLongPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={className}
      onTouchStart={(e) => {
        clear();
        fired.current = false;
        const touch = e.touches[0];
        startPos.current = { x: touch.clientX, y: touch.clientY };
        timerRef.current = setTimeout(() => {
          fired.current = true;
          // Haptic feedback on supported devices
          navigator.vibrate?.(30);
          onLongPress();
        }, 500);
      }}
      onTouchMove={(e) => {
        if (!startPos.current) return;
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - startPos.current.x);
        const dy = Math.abs(touch.clientY - startPos.current.y);
        if (dx > 10 || dy > 10) {
          // A swipe should not trigger the long-press menu, but retain the
          // initial coordinates so onTouchEnd can determine its direction.
          cancelLongPress();
        }
      }}
      onTouchEnd={(e) => {
        const touch = e.changedTouches[0];
        const start = startPos.current;
        if (start && !fired.current) {
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            navigator.vibrate?.(18);
            if (dx > 0) onSwipeRight?.(); else onSwipeLeft?.();
          }
        }
        if (fired.current) {
          e.preventDefault();
        }
        clear();
      }}
      onTouchCancel={() => clear()}
    >
      {children}
    </div>
  );
}
