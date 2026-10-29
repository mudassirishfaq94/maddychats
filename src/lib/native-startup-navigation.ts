/** Keep an early APK tap on the hydrated inbox path, not a second server page load. */
export function openStartupDestination(destination: string, navigate: (destination: string) => boolean) {
  const target = new URL(destination, window.location.origin);
  if (target.origin !== window.location.origin || !(target.pathname === "/app" || target.pathname.startsWith("/app/"))) return false;
  if (target.href === window.location.href) return true;
  const path = target.pathname + target.search + target.hash;
  const row = Array.from(document.querySelectorAll<HTMLAnchorElement>("a.chat-list-row")).find(node => node.getAttribute("href") === path);
  if (row) { row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); row.click(); return true; }
  if (window.location.pathname === "/app/chats" && target.pathname.startsWith("/app/chats/") && !document.querySelector('[data-inbox-ready="true"]')) return false;
  return navigate(path);
}
