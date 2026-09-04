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

interface PrivacySettings {
  profileVisibility: string;
  lastSeenVisibility: string;
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
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="relative shrink-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 pr-7 text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
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
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"
        }`}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function PrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/privacy/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = async (patch: Partial<PrivacySettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/privacy/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSettings(settings); // revert
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
            options={VISIBILITY_OPTIONS}
          />
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
