import { LogoMark } from "@/components/brand/logo";
import { Fingerprint, MessageCircle, Moon, MoreVertical, Search, Settings, ShieldCheck, Users, Phone, Pencil } from "lucide-react";

// Fictional demonstration data only. Never render production users or message content on a public page.
const conversations = [
  { name: "Design Circle", initials: "DC", preview: "The new concepts look great!", date: "09:42", tint: "bg-[#665042]" },
  { name: "Alex Morgan", initials: "AM", preview: "See you this weekend.", date: "Yesterday", tint: "bg-[#327d77]" },
  { name: "Weekend Plans", initials: "WP", preview: "Sounds like a plan!", date: "Mon", tint: "bg-[#8a6ab0]" },
  { name: "Jordan Lee", initials: "JL", preview: "Sent you the details.", date: "Sun", tint: "bg-[#956645]" },
  { name: "Creative Team", initials: "CT", preview: "Shared a photo", date: "Sat", tint: "bg-[#608741]" },
];

export function LandingChatPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[470px]" aria-label="Illustrative Circlo inbox with fictional names and messages">
      <div className="brand-orbit pointer-events-none absolute -inset-5 sm:-inset-9" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#3b3f46] bg-[#1d2025] text-[#f7f7f7] shadow-[0_35px_100px_-40px_rgba(0,0,0,.65)]">
        <div className="flex h-14 items-center justify-between border-b border-[#383c42] px-4">
          <div className="flex items-center gap-2 text-sm font-bold tracking-tight"><LogoMark size={27} /> circlo</div>
          <div className="flex items-center gap-3 text-[#b8becb]"><Moon className="h-4 w-4" /><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3a3e45] text-[10px]">AL</span></div>
        </div>
        <div className="flex items-center justify-between px-4 pb-3 pt-5">
          <h3 className="text-xl font-semibold tracking-tight">Chats</h3>
          <div className="flex items-center gap-4 text-[#dab47c]"><LogoMark size={23} /><Users className="h-5 w-5" /><Pencil className="h-5 w-5" /></div>
        </div>
        <div className="mx-4 flex items-center gap-3 rounded-xl bg-[#252930] px-4 py-3 text-sm text-[#929bab]"><Search className="h-4 w-4" /><span>Search conversations...</span></div>
        <div className="flex gap-5 overflow-hidden px-4 py-5 text-xs text-[#c1c9d7]"><span className="rounded-full bg-[#303238] px-3 py-2 text-[#d7af74]">All</span><span className="py-2">Unread</span><span className="py-2">Favorites</span><span className="py-2">Groups</span><span className="py-2">DMs</span></div>
        <div className="divide-y divide-[#393e46]">
          {conversations.map(({name, initials, preview, date, tint}) => <div key={name} className="flex items-center gap-3 px-4 py-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tint}`}>{initials}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{name}</div><div className="mt-1 truncate text-xs text-[#b0bacd]">{preview}</div></div>
            <div className="flex shrink-0 items-center gap-2 self-start pt-1 text-[10px] text-[#b0bacd]">{date}<MoreVertical className="h-4 w-4" /></div>
          </div>)}
        </div>
        <div className="grid grid-cols-4 border-t border-[#383c42] py-3 text-center text-[10px] text-[#b0bacd]">
          <div className="flex flex-col items-center gap-1 text-[#e4b878]"><MessageCircle className="h-5 w-5" />Chats</div>
          <div className="flex flex-col items-center gap-1"><ShieldCheck className="h-5 w-5" />Status</div>
          <div className="flex flex-col items-center gap-1"><Phone className="h-5 w-5" />Calls</div>
          <div className="flex flex-col items-center gap-1"><Settings className="h-5 w-5" />Settings</div>
        </div>
      </div>
      <div className="relative mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]"><Fingerprint className="h-4 w-4 text-[var(--accent-fg)]" /> Circlo-inspired interface · fictional conversations</div>
    </div>
  );
}
