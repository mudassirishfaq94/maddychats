"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const client = () => true;
const server = () => false;
/** Match server text first, then use the browser's locale/time zone. */
export function useHydrated() { return useSyncExternalStore(subscribe, client, server); }
