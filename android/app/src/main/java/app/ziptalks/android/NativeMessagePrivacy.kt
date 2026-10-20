package app.ziptalks.android

/** FCM cannot establish permission to show local plaintext or sender identity. */
object NativeMessagePrivacy {
    @JvmStatic fun title(request: Boolean, locked: Boolean): String =
        if (request && !locked) "New Message Request" else "Circlo"
    @JvmStatic fun body(request: Boolean, locked: Boolean): String =
        if (request && !locked) "You have received a new message request." else "New message received."
}
