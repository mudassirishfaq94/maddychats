"use client";
import { useEffect, useRef, useState } from "react";

/** Browser compositor animates progress; media/reply UI has no frame timer. */
export function StatusProgress({ duration, paused, onComplete }: { duration: number; paused: boolean; onComplete: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);
  const complete = useRef(onComplete);
  const [visible, setVisible] = useState(true);
  useEffect(() => { complete.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const value = fill.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration, fill: "forwards" });
    if (!value) return;
    animation.current = value;
    value.onfinish = () => complete.current();
    return () => { value.onfinish = null; value.cancel(); };
  }, [duration]);
  useEffect(() => {
    if (paused || !visible) animation.current?.pause();
    else animation.current?.play();
  }, [paused, visible]);
  return <span data-status-progress className="block h-full origin-left bg-white" ref={fill} style={{ transform: "scaleX(0)" }} />;
}
