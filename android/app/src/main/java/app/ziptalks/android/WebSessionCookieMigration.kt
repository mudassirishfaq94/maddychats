package app.ziptalks.android

/**
 * Older native builds saved an authentication cookie in OkHttp preferences.
 * Import it only when WebView has no session cookie, so a stale legacy cookie
 * cannot replace a valid session already held by the installed app.
 */
internal object WebSessionCookieMigration {
    fun cookiesToImport(webViewCookieHeader: String?, legacyCookies: List<String>): List<String> {
        val hasWebSession = webViewCookieHeader.orEmpty()
            .split(';')
            .any { part -> part.substringBefore('=').trim() == "maddy_session" && part.substringAfter('=', "").isNotBlank() }
        return if (hasWebSession) emptyList() else legacyCookies
    }
}
