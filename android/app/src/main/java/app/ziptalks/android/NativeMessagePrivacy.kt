package app.ziptalks.android

/** FCM carries identity and safe fallback text; plaintext is added only after device-side decryption. */
object NativeMessagePrivacy {
    @JvmStatic @JvmOverloads fun body(request: Boolean, @Suppress("UNUSED_PARAMETER") locked: Boolean, kind: String = "text", senderName: String? = null, group: Boolean = false, showDetails: Boolean = true): String {
        if (request) return "You have received a new message request."
        if (!showDetails) return "You have a new message. Open Circlo to read it."
        val message = when (kind) {
            "photo" -> "sent you a photo. Open Circlo to view it."
            "video" -> "sent you a video. Open Circlo to watch it."
            "voice" -> "sent you a voice message. Open Circlo to listen."
            "file" -> "sent you a file. Open Circlo to view it."
            else -> "sent you a message. Open Circlo to read it."
        }
        return if (group && !senderName.isNullOrBlank()) "${senderName.take(80)} $message"
        else message.replaceFirstChar { it.uppercase() }
    }

    @JvmStatic @JvmOverloads fun title(request: Boolean, @Suppress("UNUSED_PARAMETER") locked: Boolean, senderName: String? = null, groupName: String? = null): String = when {
        request && senderName.isNullOrBlank() -> "New Message Request"
        !groupName.isNullOrBlank() && !senderName.isNullOrBlank() -> "${NativeNotificationText.title(mapOf("title" to groupName))} · Circlo"
        !senderName.isNullOrBlank() -> "${NativeNotificationText.title(mapOf("title" to senderName))} · Circlo"
        else -> "Circlo"
    }
}
