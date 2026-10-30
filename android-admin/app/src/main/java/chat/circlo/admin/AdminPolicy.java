package chat.circlo.admin;

import java.net.URI;
import java.util.Locale;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;

/** Native capabilities are bound to the canonical origin, never a supplied URL or role claim. */
public final class AdminPolicy {
    public static final String ORIGIN = "https://circlo.chat";
    public static final String HOME = ORIGIN + "/app/admin";
    public static final int MAX_EXPORT_BYTES = 16 * 1024 * 1024;
    private static final Set<String> EXPORT_TYPES = new HashSet<>(Arrays.asList("application/json", "text/csv", "text/plain", "application/pdf", "application/zip", "image/png", "image/jpeg", "image/webp"));
    private AdminPolicy() {}

    public static boolean trusted(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "circlo.chat".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                && !value.contains("\\");
        } catch (Exception ignored) { return false; }
    }
    public static boolean externalHttps(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443) && !value.contains("\\");
        } catch (Exception ignored) { return false; }
    }
    public static boolean trustedBlob(String value) { return value != null && value.startsWith("blob:") && trusted(value.substring(5)); }
    public static String exportType(String value) {
        if (value == null) return null;
        String type = value.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return EXPORT_TYPES.contains(type) ? type : null;
    }
    public static String filename(String raw) {
        String value = raw == null ? "circlo-admin-report.json" : raw.replaceAll("[\\p{Cntrl}<>:\"/\\\\|?*]", "_");
        value = value.replaceAll("^\\.+", "").trim();
        if (value.isEmpty()) value = "circlo-admin-report.json";
        return value.length() > 100 ? value.substring(0, 100) : value;
    }
}
