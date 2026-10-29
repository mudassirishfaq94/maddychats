import type { AttachmentDTO } from "@/lib/types";

/** Reserve the real attachment layout without suspending the chat or fetching media. */
export function PendingMessageAttachments({attachments}:{attachments:AttachmentDTO[]}) {
  const media=attachments.filter(item=>item.kind==="image"||item.kind==="video");
  return <div aria-label="Attachment preview" className={`${media.length?"w-[min(360px,70vw)]":"w-60"} max-w-full space-y-2`}>
    {media.length?<div className={`grid gap-1.5 ${media.length===1?"grid-cols-1":"grid-cols-2"}`}>{media.map(item=><div key={item.id} className="aspect-[4/3] max-h-[270px] w-full max-w-[360px] rounded-xl bg-black/5"/>)}</div>:null}
    {attachments.filter(item=>item.kind==="file").map(item=><div key={item.id} className="flex h-[58px] w-60 max-w-full items-center rounded-xl border border-[var(--border)] px-3 text-xs text-[var(--muted)]">File</div>)}
  </div>;
}
