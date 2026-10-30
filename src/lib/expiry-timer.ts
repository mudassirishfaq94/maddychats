/** A timeout is only a wake-up hint: fractional/clamped deadlines may need another check. */
export function scheduleMonotonicDeadline(deadline: number, onDue: () => void, now = () => performance.now()) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!active) return;
    const remaining = deadline - now();
    if (remaining > 0) timer = setTimeout(check, Math.min(2147483647, Math.ceil(remaining) + 1));
    else { active = false; onDue(); }
  };
  check();
  return () => { active = false; clearTimeout(timer); };
}
