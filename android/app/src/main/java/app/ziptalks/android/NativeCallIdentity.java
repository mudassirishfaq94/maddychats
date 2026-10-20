package app.ziptalks.android;

/** Caller identity is visible only when on-device conversation privacy permits it. */
final class NativeCallIdentity {
    static String name(String title, boolean locked) {
        if (locked || title == null) return "Circlo";
        String value = title.replaceAll("[\\p{Cc}\\p{Cf}]", " ").replaceAll("\\s+", " ").trim();
        if (value.endsWith(" · Circlo")) value = value.substring(0, value.length() - 9).trim();
        if (value.isEmpty()) return "Circlo";
        return value.codePointCount(0, value.length()) > 80 ? value.substring(0, value.offsetByCodePoints(0, 80)) : value;
    }
}
