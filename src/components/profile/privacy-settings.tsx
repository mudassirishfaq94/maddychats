"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  MessageCircle,
  Clock,
  Shield,
  Bell,
  CheckCheck,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

interface PrivacySettings {
  profileVisibility: string;
  lastSeenVisibility: string;
  lastSeenContacts: string[];
  statusVisibility: string;
  whoCanMessage: string;
  loginAlerts: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
}

const VISIBILITY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "contacts", label: "Contacts" },
  { value: "nobody", label: "Nobody" },
];

function SelectField({
  label,
  icon: Icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="relative min-w-0 sm:shrink-0">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl sm:w-auto border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 pr-7 text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--muted)]" />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <span className="text-sm">{label}</span>
      </div>
      <Toggle checked={checked} onChange={onChange} label={`Toggle ${label}`} />
    </div>
  );
}

export function PrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Array<{id:string;displayName:string}>>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/contacts", {cache:"no-store"}).then(async r=>{if(r.ok)setContacts((await r.json()).users??[]);}).catch(()=>{});
    fetch("/api/privacy/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = async (patch: Partial<PrivacySettings>) => {
    if (!settings || saving) return;
    setError("");
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/privacy/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Privacy settings could not be saved.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSettings(settings); setError("Could not save privacy settings. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card-flat rounded-2xl p-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="card-glass rounded-2xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <Shield className="h-4.5 w-4.5 text-[var(--accent)]" />
        <h2 className="text-sm font-bold">Privacy & Safety</h2>
        {saving && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--muted)]" />}
        {saved && !saving && (
          <span className="ml-auto text-xs text-[var(--success)]">Saved ✓</span>
        )}
      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>:null}
      <div className="mt-4 divide-y divide-[var(--border)]">
        <div>
          <p className="pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Visibility
          </p>
          <SelectField
            label="Profile"
            icon={Eye}
            value={settings.profileVisibility}
            onChange={(v) => update({ profileVisibility: v })}
            options={VISIBILITY_OPTIONS}
          />
          <SelectField
            label="Last seen"
            icon={Clock}
            value={settings.lastSeenVisibility}
            onChange={(v) => update({ lastSeenVisibility: v })}
            options={[...VISIBILITY_OPTIONS,{value:"specific",label:"Specific Contacts Only"}]}
          />
          {settings.lastSeenVisibility === "specific" ? <fieldset disabled={saving} className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] p-3"><legend className="px-1 text-xs">Share last seen with</legend>{contacts.length ? contacts.map(contact=><label key={contact.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={(settings.lastSeenContacts??[]).includes(contact.id)} onChange={event=>void update({lastSeenContacts:event.target.checked?[...(settings.lastSeenContacts??[]),contact.id]:(settings.lastSeenContacts??[]).filter(id=>id!==contact.id)})}/>{contact.displayName}</label>):<p className="text-sm text-[var(--muted)]">Add saved contacts in People first. No one can see your last seen while this list is empty.</p>}</fieldset>:null}
          <SelectField
            label="Status"
            icon={EyeOff}
            value={settings.statusVisibility}
            onChange={(v) => update({ statusVisibility: v })}
            options={VISIBILITY_OPTIONS}
          />
        </div>

        <div>
          <p className="py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Messaging
          </p>
          <SelectField
            label="Who can message me"
            icon={MessageCircle}
            value={settings.whoCanMessage}
            onChange={(v) => update({ whoCanMessage: v })}
            options={VISIBILITY_OPTIONS}
          />
          <ToggleField
            label="Read receipts"
            icon={CheckCheck}
            checked={settings.readReceipts}
            onChange={(v) => update({ readReceipts: v })}
          />
          <ToggleField
            label="Typing indicators"
            icon={MessageCircle}
            checked={settings.typingIndicators}
            onChange={(v) => update({ typingIndicators: v })}
          />
        </div>

        <div>
          <p className="py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Security
          </p>
          <ToggleField
            label="Login alerts"
            icon={Bell}
            checked={settings.loginAlerts}
            onChange={(v) => update({ loginAlerts: v })}
          />
        </div>
      </div>
    </div>
  );
}
