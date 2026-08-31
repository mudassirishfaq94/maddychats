type AlertProps = {
  variant?: "error" | "info" | "success";
  children: React.ReactNode;
};

const styles = {
  error:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  info: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
};

export function Alert({ variant = "info", children }: AlertProps) {
  return (
    <div
      role="alert"
      className={`animate-fade-in rounded-xl border px-4 py-3 text-sm font-medium ${styles[variant]}`}
    >
      {children}
    </div>
  );
}
