package app.ziptalks.android

import org.junit.Assert.assertEquals
import org.junit.Test

class WebSessionCookieMigrationTest {
    @Test
    fun doesNotReplaceAnExistingWebViewSessionWithLegacyCookies() {
        val legacy = listOf("maddy_session=stale; Path=/; Secure", "legacy_pref=1; Path=/")
        assertEquals(emptyList<String>(), WebSessionCookieMigration.cookiesToImport("maddy_session=current; theme=dark", legacy))
    }

    @Test
    fun migratesLegacyCookiesWhenWebViewHasNoSession() {
        val legacy = listOf("maddy_session=legacy; Path=/; Secure")
        assertEquals(legacy, WebSessionCookieMigration.cookiesToImport("theme=dark", legacy))
        assertEquals(legacy, WebSessionCookieMigration.cookiesToImport(null, legacy))
    }
    @Test
    fun preservesRefreshSessionAfterShortLivedAccessCookieExpires() {
        val legacy = listOf("maddy_session=stale; Path=/; Secure", "maddy_refresh=stale-refresh; Path=/; Secure")
        assertEquals(emptyList<String>(), WebSessionCookieMigration.cookiesToImport("maddy_refresh=current; theme=dark", legacy))
    }
}
