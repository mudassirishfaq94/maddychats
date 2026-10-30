package app.ziptalks.android;

/** Eligibility for a read-only local snapshot, never server authorization. */
final class StartupSnapshotBindingPolicy {
    static final long MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000;
    static boolean eligible(String user, String session, String digest, long recorded,
                            String currentDigest, String currentUser, String currentSession,
                            boolean pending, long now) {
        return StartupSnapshotPolicy.chatId(user) && StartupSnapshotPolicy.chatId(session)
            && digest != null && digest.matches("[0-9a-f]{64}") && digest.equals(currentDigest)
            && recorded > 0 && now >= recorded && now - recorded < MAX_AGE_MS && !pending
            && ((currentUser == null) == (currentSession == null))
            && (currentUser == null || user.equals(currentUser))
            && (currentSession == null || session.equals(currentSession));
    }
}
