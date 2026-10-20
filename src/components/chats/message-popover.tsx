"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Escape message-row paint containment without disabling history virtualization. */
export function MessagePopover({ anchor, label, onClose, children, className = "", role = "dialog" }: {
  anchor: RefObject<HTMLButtonElement | null>; label: string; onClose: () => void;
  children: ReactNode; className?: string; role?: "dialog" | "menu";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 320, visibility: "hidden" as "hidden" | "visible" });
  useLayoutEffect(() => {
    const place = () => {
      const trigger = anchor.current, popup = ref.current;
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const top = (viewport?.offsetTop ?? 0) + 8, left = (viewport?.offsetLeft ?? 0) + 8;
      const right = left + (viewport?.width ?? innerWidth) - 16;
      const bottom = top + (viewport?.height ?? innerHeight) - 16;
      const height = Math.min(popup.scrollHeight, bottom - top);
      const above = rect.top - height - 8;
      setPosition({ left: Math.max(left, Math.min(rect.right - popup.offsetWidth, right - popup.offsetWidth)),
        top: Math.max(top, Math.min(above >= top ? above : rect.bottom + 8, bottom - height)), maxHeight: bottom - top, visibility: "visible" });
    };
    place(); ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close.current(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); anchor.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && ref.current?.contains(document.activeElement)) {
        const buttons = Array.from(ref.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[next]?.focus();
      }
    };
    const scroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) close.current(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    document.addEventListener("scroll", scroll, true); window.addEventListener("resize", place);
    const observer = new ResizeObserver(place); if (ref.current) observer.observe(ref.current);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [anchor]);
  return createPortal(<div ref={ref} role={role} aria-label={label} style={position}
    className={`fixed z-[160] max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl ${className}`}>{children}</div>, document.body);
}
