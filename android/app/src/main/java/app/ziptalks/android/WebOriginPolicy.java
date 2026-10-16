package app.ziptalks.android;

import java.net.URI;

/** Pure origin policy shared by navigation and both microphone-grant stages. */
final class WebOriginPolicy {
    static boolean isAllowed(String value, String origin) {
        try {
            URI target = new URI(value);
            URI trusted = new URI(origin);
            int port = target.getPort() == -1 ? 443 : target.getPort();
            int trustedPort = trusted.getPort() == -1 ? 443 : trusted.getPort();
            return "https".equalsIgnoreCase(target.getScheme()) && target.getHost() != null
                && target.getRawUserInfo() == null && target.getHost().equalsIgnoreCase(trusted.getHost())
                && port == trustedPort;
        } catch (Exception error) { return false; }
    }
}
