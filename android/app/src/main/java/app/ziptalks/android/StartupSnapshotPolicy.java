package app.ziptalks.android;

/** Selects an existing local snapshot only. Never grants server/session access. */
final class StartupSnapshotPolicy {
    private static final String UUID = "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    static boolean eligible(String user, String session, long expirySeconds, boolean pending, long nowMillis) {
        return user != null && user.matches(UUID) && session != null && session.matches(UUID)
            && !pending && expirySeconds > nowMillis / 1000;
    }
    static boolean chatId(String value) { return value != null && value.matches(UUID); }
}
