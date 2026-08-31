import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

const highlights = [
  {
    title: "Real-time by design",
    body: "Built on a fast Express + PostgreSQL core, ready for live messaging.",
  },
  {
    title: "Private & secure",
    body: "Passwords are hashed with bcrypt and sessions use HttpOnly cookies.",
  },
  {
    title: "Yours, everywhere",
    body: "A polished, responsive experience that follows you across devices.",
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </header>

        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-2">
          {/* Left: marketing / brand panel */}
          <section className="hidden animate-fade-in flex-col justify-center lg:flex">
            <h1 className="max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 dark:text-white">
              Conversations that feel{" "}
              <span className="bg-gradient-to-r from-brand-500 to-indigo-500 bg-clip-text text-transparent">
                effortless
              </span>
              .
            </h1>
            <p className="mt-4 max-w-md text-base text-slate-600 dark:text-slate-300">
              Maddy Chats keeps you close to the people who matter — fast,
              beautiful, and refreshingly simple.
            </p>

            <ul className="mt-10 space-y-5">
              {highlights.map((h) => (
                <li key={h.title} className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brand-600/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {h.title}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {h.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Right: auth card */}
          <section className="mx-auto w-full max-w-md animate-fade-up">
            <div className="card p-7 sm:p-9">
              <div className="mb-7">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {title}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              </div>
              {children}
            </div>
            {footer && (
              <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {footer}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
