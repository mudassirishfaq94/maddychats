package app.ziptalks.android;
import java.net.URI;
/** Only canonical, non-actionable public contact/invite entry points. Joining still requires server authorization. */
final class PublicAppLink {
    static String destination(String raw, String base) {
        try {
            URI uri = new URI(raw), origin = new URI(base);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || !uri.getHost().equalsIgnoreCase(origin.getHost()) || uri.getPort() != origin.getPort() || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return null;
            String path = uri.getRawPath();
            if (path == null || !path.matches("/(?:contact/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|invite/(?:[a-f0-9]{12}|[a-f0-9]{32}))")) return null;
            return base.replaceAll("/+$", "") + path;
        } catch (Exception ignored) { return null; }
    }
}
