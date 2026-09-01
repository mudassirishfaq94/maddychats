"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const { signOut } = useAuth();
  const router = useRouter();

  async function handleClick() {
    setPending(true);
    await signOut();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn("btn btn-secondary", className)}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
