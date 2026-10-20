package app.ziptalks.android;

import java.net.URI;

/** Incoming intents cannot navigate to arbitrary sites or extend a ringing deadline. */
final class NativeCallPolicy {
    static boolean validAction(String user, String boundUser, String call, String boundCall, String token, String boundToken, long expires, long now) {
        return user != null && user.equals(boundUser) && uuid(call) && call.equals(boundCall)
            && uuid(token) && token.equals(boundToken) && expires > now && expires <= now + 45000;
    }
    static boolean uuid(String value) {
        return value != null && value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}");
    }
    static boolean valid(String account, String recipient, String call, String url, long expires, long now) {
        if (account == null || !account.equals(recipient) || !uuid(call) || expires <= now || expires > now + 45000) return false;
        try {
            URI target = new URI(url);
            if (!"ziptalks".equals(target.getScheme()) || !"chat".equals(target.getHost()) || target.getUserInfo() != null || target.getPort() != -1) return false;
            return uuid(target.getPath().substring(1)) && ("call=" + call).equals(target.getRawQuery()) && target.getFragment() == null;
        } catch (Exception ignored) { return false; }
    }
}
