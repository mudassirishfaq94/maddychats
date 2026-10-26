package app.ziptalks.android

/**
 * Older native builds saved an authentication cookie in OkHttp preferences.
 * Import it only when WebView has no session cookie, so a stale legacy cookie
 * cannot replace a valid session already held by the installed app.
 */
internal object WebSessionCookieMigration {
    /**
     * Returns [legacyCookies] unchanged, or an empty list if [webViewCookieHeader]
     * contains a nonblank `maddy_session` or `maddy_refresh` value. A null header
     * is treated as empty; cookie validity is not checked.
     */
    fun cookiesToImport(webViewCookieHeader: String?, legacyCookies: List<String>): List<String> {
        return cookiesToImport(webViewCookieHeader) { legacyCookies }
    }

    /**
     * Returns an empty list without calling [legacyCookies] if [webViewCookieHeader]
     * contains a nonblank `maddy_session` or `maddy_refresh` value.
     * Otherwise, calls [legacyCookies] once and returns its result unchanged.
     * A null header is treated as empty; cookie validity is not checked.
     * Exceptions from [legacyCookies] propagate to the caller.
     */
    fun cookiesToImport(webViewCookieHeader: String?, legacyCookies: () -> List<String>): List<String> {
        val hasWebSession = webViewCookieHeader.orEmpty()
            .split(';')
            .any { part -> part.substringBefore('=').trim() in setOf("maddy_session", "maddy_refresh") && part.substringAfter('=', "").isNotBlank() }
        return if (hasWebSession) emptyList() else legacyCookies()
    }
}
