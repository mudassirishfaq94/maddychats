package app.ziptalks.android

/** FCM cannot establish permission to show local plaintext or sender identity. */
object NativeMessagePrivacy {
    @JvmStatic fun title(request: Boolean, locked: Boolean, senderName: String? = null): String = when {
        request && !locked -> "New Message Request"
        !locked && !senderName.isNullOrBlank() -> "${NativeNotificationText.title(mapOf("title" to senderName))} · Circlo"
        else -> "Circlo"
    }
    @JvmStatic fun body(request: Boolean, locked: Boolean): String =
        if (request && !locked) "You have received a new message request." else "New message received."
}
