package app.ziptalks.android;

/** Pure decisions used at the native trust boundary, independently unit-testable. */
final class PushPolicy {
    static boolean switchesAccount(String current, String next) {
        return current != null && !current.equals(next);
    }
    static boolean isMessageTag(String tag) {
        return tag != null && (tag.startsWith("circlo-chat-") || tag.equals("circlo-messages"));
    }
    static boolean allowsBridge(boolean mainFrame, String source, String top, String origin) {
        return mainFrame && WebOriginPolicy.isAllowed(source, origin) && WebOriginPolicy.isAllowed(top, origin);
    }
    static boolean acceptsEvent(String account, String recipient, String event, long expires, long now, boolean foreground) {
        return !foreground && account != null && account.equals(recipient)
            && event != null && event.matches("[a-fA-F0-9-]{36}") && expires > now && expires <= now + 3600000;
    }
}
