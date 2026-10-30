package app.ziptalks.android;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Public assets only. Independent of WebView page-commit callback ordering. */
final class OfflineShellAssets {
    private static final Set<String> PATHS = new HashSet<>(Arrays.asList("/offline.html", "/offline.css", "/offline-compose.js", "/offline-store.js", "/startup.html", "/startup.css", "/startup.js", "/startup-reader.js", "/icons/circlo-mark.svg"));
    static String assetPath(String url, String origin, String method) {
        if (!"GET".equals(method) || !WebOriginPolicy.isAllowed(url, origin)) return null;
        try {
            String path = new URI(url).getRawPath();
            return PATHS.contains(path) ? "circlo-offline" + path : null;
        } catch (Exception error) { return null; }
    }
    static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/javascript";
    }
}
