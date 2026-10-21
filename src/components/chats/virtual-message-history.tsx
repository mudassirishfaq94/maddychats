"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { MessageDTO } from "@/lib/types";
import { HistoryRowRetention } from "./history-row-retention";

export type HistoryItem = { msg: MessageDTO; showDate: boolean; sameSenderPrev: boolean };
export type MessageHistoryHandle = {
  scrollToMessage: (id: string) => boolean;
  scrollToEnd: () => void;
  virtualized: boolean;
};

/** Small pages retain normal HTML; loaded long histories keep only a measured window mounted. */
export function VirtualMessageHistory({ items, scrollRef, scrollElement, contentRef, historyRef, editingId, renderItem }: {
  items: HistoryItem[]; scrollRef: RefObject<HTMLDivElement | null>; scrollElement: HTMLDivElement | null; contentRef: RefObject<HTMLDivElement | null>;
  historyRef: Ref<MessageHistoryHandle>; editingId: string | null; renderItem: (item: HistoryItem) => ReactNode;
}) {
  const enabled = items.length > 60;
  const [margin, setMargin] = useState(0);
  const [playing, setPlaying] = useState<Set<string>>(() => new Set());
  const [retained, setRetained] = useState<Set<string>>(() => new Set());
  const retain = useCallback((id: string, active: boolean) => setRetained(current => {
    if (current.has(id) === active) return current;
    const next = new Set(current); if (active) next.add(id); else next.delete(id); return next;
  }), []);
  const pendingScroll = useRef<{ id: string } | "end" | null>(null);
  const indexes = useMemo(() => new Map(items.map((item, index) => [item.msg.id, index])), [items]);
  const getItemKey = useCallback((index: number) => items[index].msg.id, [items]);
  const rangeExtractor = useCallback((range: Parameters<typeof defaultRangeExtractor>[0]) => {
    const indexesToRender = new Set(defaultRangeExtractor(range));
    for (const id of [...playing, ...retained]) { const index = indexes.get(id); if (index !== undefined) indexesToRender.add(index); }
    const editing = editingId ? indexes.get(editingId) : undefined;
    if (editing !== undefined) indexesToRender.add(editing);
    return [...indexesToRender].sort((a, b) => a - b);
  }, [playing, retained, indexes, editingId]);
  // The virtualizer owns mutable measurement state; keep it outside React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length, getScrollElement: () => scrollElement, getItemKey,
    estimateSize: index => items[index].msg.attachments.length ? 300 : 100,
    overscan: 8, enabled, anchorTo: "end", followOnAppend: false,
    scrollMargin: margin, rangeExtractor,
  });
  useImperativeHandle(historyRef, () => ({
    virtualized: enabled,
    scrollToMessage(id) {
      const index = indexes.get(id);
      if (index === undefined) return false;
      if (enabled && !virtualizer.scrollElement) pendingScroll.current = { id };
      else if (enabled) virtualizer.scrollToIndex(index, { align: "center" });
      else contentRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    },
    scrollToEnd() {
      if (enabled && !virtualizer.scrollElement) pendingScroll.current = "end";
      else if (enabled) virtualizer.scrollToEnd();
      else scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    },
  }), [enabled, indexes, virtualizer, contentRef, scrollRef]);
  useLayoutEffect(() => {
    if (!scrollElement || !enabled || !pendingScroll.current) return;
    const pending = pendingScroll.current; pendingScroll.current = null;
    if (pending === "end") virtualizer.scrollToEnd();
    else { const index = indexes.get(pending.id); if (index !== undefined) virtualizer.scrollToIndex(index, { align: "center" }); }
  }, [scrollElement, enabled, indexes, virtualizer]);
  useLayoutEffect(() => {
    if (!enabled) return;
    const viewport = scrollElement, content = contentRef.current;
    if (!viewport || !content) return;
    const update = () => setMargin(content.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - viewport.clientTop);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(content);
    if (content.previousElementSibling) observer.observe(content.previousElementSibling);
    const siblings = new MutationObserver(update);
    siblings.observe(viewport, { childList: true });
    return () => { observer.disconnect(); siblings.disconnect(); };
  }, [enabled, scrollElement, contentRef]);
  useEffect(() => {
    const viewport = scrollElement;
    if (!viewport) return;
    const media = (event: Event) => {
      const element = event.target;
      if (!(element instanceof HTMLMediaElement)) return;
      const id = element.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
      if (!id) return;
      setPlaying(current => {
        const active = !element.paused && !element.ended;
        if (current.has(id) === active) return current;
        const next = new Set(current); if (active) next.add(id); else next.delete(id); return next;
      });
    };
    for (const event of ["play", "pause", "ended"]) viewport.addEventListener(event, media, true);
    return () => { for (const event of ["play", "pause", "ended"]) viewport.removeEventListener(event, media, true); };
  }, [scrollElement]);
  const setContent = useCallback((node: HTMLDivElement | null) => { contentRef.current = node; }, [contentRef]);
  return <HistoryRowRetention.Provider value={retain}><div ref={setContent} data-virtualized={enabled ? "true" : undefined}
    className="relative z-10 pb-4" style={enabled ? { height: virtualizer.getTotalSize(), width: "100%", overflowAnchor: "none" } : undefined}>
    {enabled ? virtualizer.getVirtualItems().map(item => <div key={item.key} data-index={item.index}
      ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full flow-root"
      style={{ transform: `translateY(${item.start - margin}px)` }}>
      {renderItem(items[item.index])}
    </div>) : items.map(item => <div key={item.msg.id}>{renderItem(item)}</div>)}
  </div></HistoryRowRetention.Provider>;
}
