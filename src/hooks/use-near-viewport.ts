"use client";
import { useEffect, useRef, useState } from "react";

/** Keep the placeholder in layout while avoiding offscreen media I/O. */
export function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      setNear(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, near };
}
