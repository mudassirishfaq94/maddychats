package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class OfflineShellAssetsTest {
    @Test public void publicShellAndEveryDependencyAreAvailableWithoutLoadingState() {
        for (String path : new String[]{"/offline.html", "/offline.css", "/offline-compose.js", "/offline-store.js", "/icons/circlo-mark.svg"}) {
            assertEquals("circlo-offline" + path, OfflineShellAssets.assetPath("https://circlo.chat" + path, "https://circlo.chat", "GET"));
        }
        assertEquals("text/html", OfflineShellAssets.mimeType("offline.html"));
        assertEquals("text/css", OfflineShellAssets.mimeType("offline.css"));
        assertEquals("application/javascript", OfflineShellAssets.mimeType("offline-compose.js"));
        assertEquals("image/svg+xml", OfflineShellAssets.mimeType("circlo-mark.svg"));
    }
    @Test public void neverInterceptsPrivateContentOtherOriginsOrEncodedPaths() {
        for (String url : new String[]{"https://circlo.chat/api/auth/me", "https://circlo.chat/app/chats", "https://circlo.chat/api/media/private", "https://evil.invalid/offline.css", "http://circlo.chat/offline.css", "https://circlo.chat:444/offline.css", "https://circlo.chat/%6fffline.css", "https://circlo.chat/icons/../offline.css"}) {
            assertNull(url, OfflineShellAssets.assetPath(url, "https://circlo.chat", "GET"));
        }
        assertNull(OfflineShellAssets.assetPath("https://circlo.chat/offline.css", "https://circlo.chat", "POST"));
    }
}
