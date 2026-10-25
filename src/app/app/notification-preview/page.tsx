import type { Metadata } from "next";
import { isUuid } from "@/server/users";
import { NotificationPreviewClient } from "./preview-client";

export const metadata: Metadata = { title: "Notification" };
export const dynamic = "force-dynamic";

export default async function NotificationPreviewPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <NotificationPreviewClient notificationId={id && isUuid(id) ? id : ""} />;
}
