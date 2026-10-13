"use client";
import { useEffect, useState } from "react";
import { FreshAuthentication } from "./fresh-authentication";
import { navigateWithReload } from "@/lib/navigation";
import { timeAgo } from "@/lib/utils";

type DeviceSession = {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
};

type Device = {
  deviceId: string;
  label: string;
  platform: string;
  trusted: boolean;
  trustedAt: string | null;
  createdAt: string;
  lastUsedAt: string;
  countryName: string;
  countryFlag: string;
  pendingLinkExpiresAt: string | null;
  sessions: DeviceSession[];
};

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [unbound, setUnbound] = useState<DeviceSession[]>([]);
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/privacy/devices", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load devices.");
        setDevices(data.devices);
        setUnbound(data.unboundSessions ?? []);
        setLegacy(data.legacy);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  async function revoke(id?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/privacy/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(id ? { id } : { allOthers: true }), password, mfaCode: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to revoke device.");
      setPassword("");
      setCode("");
      const signedOutSelf = id
        ? devices.some((device) => device.sessions.some((session) => session.id === id && session.current)) ||
          unbound.some((session) => session.id === id && session.current)
        : false;
      if (signedOutSelf) {
        navigateWithReload("/login");
        return;
      }
      setDevices((previous) =>
        previous.map((device) => ({
          ...device,
          sessions: id
            ? device.sessions.filter((session) => session.id !== id)
            : device.sessions.filter((session) => session.current),
        })),
      );
      setUnbound((previous) =>
        id ? previous.filter((session) => session.id !== id) : previous.filter((session) => session.current),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const signedInSessions =
    devices.reduce((total, device) => total + device.sessions.length, 0) + unbound.length;
  const otherSessions =
    devices.some((device) => device.sessions.some((session) => !session.current)) ||
    unbound.some((session) => !session.current);

  return (
    <section className="card-flat rounded-2xl p-5">
      <h2 className="font-semibold">Devices</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        A device is one browser or app with its own saved encryption key. Signing in again in the same browser keeps
        its approval; a different browser is a new device and needs to be linked once.
      </p>
      {legacy && <p className="mt-2 text-sm">Sign in again to register this browser as a device.</p>}
      <FreshAuthentication password={password} code={code} onPassword={setPassword} onCode={setCode} />
      {loading && <p role="status">Loading devices…</p>}
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {devices.map((device) => (
          <li key={device.deviceId} className="border-t border-[var(--border)] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium break-words">{device.label}</p>
              <span className={device.trusted ? "badge badge-accent" : "badge"}>{device.trusted ? "Trusted" : "Not trusted"}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {device.countryFlag ? `${device.countryFlag} ` : ""}
              {device.countryName}
              {device.platform ? ` · ${device.platform}` : ""}
              {" · "}
              Last used {timeAgo(device.lastUsedAt)}
            </p>
            <p className="mt-1 break-all font-mono text-[0.7rem] text-[var(--muted)]">{device.deviceId}</p>
            {device.pendingLinkExpiresAt ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                A linking code was issued for this device and expires {new Date(device.pendingLinkExpiresAt).toLocaleTimeString()}.
              </p>
            ) : null}

            {device.sessions.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">No browser is signed in with this device right now.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {device.sessions.map((session) => (
                  <li key={session.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs break-words">
                        {session.userAgent}
                        {session.current ? " · This browser" : ""}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Signed in {timeAgo(session.createdAt)} · expires {new Date(session.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0 text-xs"
                      disabled={busy}
                      onClick={() => void revoke(session.id)}
                    >
                      Sign out
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {!loading && !devices.length && !error && <p className="mt-3 text-sm text-[var(--muted)]">No devices registered yet.</p>}

      {unbound.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
          <p className="text-sm font-medium">Signed in without an encryption key</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            These browsers are signed in but have not registered and approved an encryption key yet, so they are not
            listed as devices. Reload one of them in a different tab to finish setup.
          </p>
          <ul className="mt-2 space-y-2">
            {unbound.map((session) => (
              <li key={session.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs break-words">
                    {session.userAgent}
                    {session.current ? " · This browser" : ""}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Signed in {timeAgo(session.createdAt)} · expires {new Date(session.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 text-xs"
                  disabled={busy}
                  onClick={() => void revoke(session.id)}
                >
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="btn btn-secondary mt-4"
        disabled={busy || legacy || signedInSessions === 0 || !otherSessions}
        onClick={() => void revoke()}
      >
        Sign out other devices
      </button>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Signing a device out ends its session and removes its encryption approval. Signing out of Circlo ends all
        sessions on the account.
      </p>
    </section>
  );
}
