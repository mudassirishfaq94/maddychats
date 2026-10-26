import { redirect } from "next/navigation";
import { publicMetadata } from "@/lib/public-metadata";
import { getSessionUser } from "@/server/session";
import { SimpleLanding } from "@/components/landing/simple-page";

export const metadata = publicMetadata(
  "/",
  "Circlo — Private chat for you and your people",
  "Private chats, groups, voice notes and audio calls. End-to-end encrypted and free to use in your browser. Android app coming soon."
);
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  if (await getSessionUser()) redirect("/app");
  return <SimpleLanding />;
}
