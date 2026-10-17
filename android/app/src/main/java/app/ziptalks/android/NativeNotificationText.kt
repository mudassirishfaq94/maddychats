package app.ziptalks.android

object NativeNotificationText {
    private const val MAX_TITLE_LENGTH = 80
    private const val MAX_BODY_LENGTH = 140
    private const val DEFAULT_TITLE = "Circlo"
    private const val DEFAULT_BODY = "New message. Open Circlo to read it."
    private val unsafeControls = Regex("[\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]")
    private val repeatedWhitespace = Regex("\\s+")

    /**
     * The server resolves the alert text with the recipient's own preference,
     * so the installed app shows exactly what the browser shows. Older
     * payloads without a resolved title still fall back to the sender field.
     */
    @JvmStatic
    fun title(data: Map<String, String>): String =
        clean(data["title"], clean(data["actorName"], DEFAULT_TITLE, MAX_TITLE_LENGTH), MAX_TITLE_LENGTH)

    @JvmStatic
    fun body(data: Map<String, String>): String =
        clean(data["body"], clean(data["preview"], DEFAULT_BODY, MAX_BODY_LENGTH), MAX_BODY_LENGTH)

    private fun clean(value: String?, fallback: String, limit: Int): String {
        val normalized = value.orEmpty().replace(unsafeControls, " ").replace(repeatedWhitespace, " ").trim()
        val bounded = normalized.take(limit).let { text ->
            if (text.isNotEmpty() && Character.isHighSurrogate(text.last())) text.dropLast(1) else text
        }
        return bounded.ifBlank { fallback }
    }
}