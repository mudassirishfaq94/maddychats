import { NextResponse } from "next/server";
import { PasswordBusyError } from "./password";

/** Busy password workers never mean invalid credentials or a successful change. */
export function passwordBusyResponse(error: unknown): NextResponse | null {
  if (!(error instanceof PasswordBusyError)) return null;
  return NextResponse.json({ error: "Sign-in is busy. Please try again in a few seconds." }, {
    status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" },
  });
}

export function withPasswordCapacity<A extends unknown[], R>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | NextResponse> => {
    try { return await handler(...args); }
    catch (error) {
      const response = passwordBusyResponse(error);
      if (response) return response;
      throw error;
    }
  };
}
