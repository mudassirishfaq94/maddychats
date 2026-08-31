import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />

          <div className="flex items-center gap-2">
            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-700 transition hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-bold text-white">
                  {initials(user.displayName)}
                </span>
                <span className="hidden sm:inline">{user.displayName}</span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        @{user.username}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfile(true);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                      <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="animate-fade-up">
          <p className="text-sm font-medium text-brand-600 dark:text-brand-300">
            Welcome to Maddy Chats
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Hey {user.displayName.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-300">
            Your account is set up and secured. Real-time chat is coming next —
            for now, here’s your home base.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ShellCard
            title="Conversations"
            body="Your chats will live here. Direct messages and groups are on the way."
            badge="Coming soon"
            icon={
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            }
          />
          <ShellCard
            title="Presence"
            body="See who’s online and stay in sync in real time with Socket.IO."
            badge="Coming soon"
            icon={<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>}
          />
          <ShellCard
            title="Media & files"
            body="Share images and files, stored safely on the server."
            badge="Coming soon"
            icon={<><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></>}
          />
        </div>
      </main>

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
}

function ShellCard({
  title,
  body,
  badge,
  icon,
}: {
  title: string;
  body: string;
  badge: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
          {badge}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{body}</p>
    </div>
  );
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  const rows: [string, string][] = [
    ["Display name", user.displayName],
    ["Username", `@${user.username}`],
    ["Email", user.email],
    ["Member since", new Date(user.createdAt).toLocaleDateString()],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="card relative z-10 w-full max-w-md animate-fade-up p-7">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-lg font-bold text-white">
            {initials(user.displayName)}
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {user.displayName}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              @{user.username}
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100 dark:divide-white/5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-3">
              <dt className="text-sm text-slate-500 dark:text-slate-400">
                {label}
              </dt>
              <dd className="text-sm font-medium text-slate-900 dark:text-white">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <button type="button" onClick={onClose} className="btn-ghost mt-6 w-full">
          Close
        </button>
      </div>
    </div>
  );
}
