"use client";
import { useLayoutEffect, useRef } from "react";

/** Event handlers see the latest committed state while memoized children keep a stable ref. */
export function useCommittedRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; }, [value]);
  return ref;
}
