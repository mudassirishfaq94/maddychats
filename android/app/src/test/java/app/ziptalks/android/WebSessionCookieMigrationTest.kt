package app.ziptalks.android

import org.junit.Assert.assertEquals
import org.junit.Test

class WebSessionCookieMigrationTest {
    @Test
    fun existingSessionsNeverInitializeTheLegacyClient() {
        for (header in listOf("maddy_session=current", "maddy_refresh=current", "maddy_session=; maddy_refresh=current")) {
            assertEquals(emptyList<String>(), WebSessionCookieMigration.cookiesToImport(header) { error("Legacy client must stay lazy") })
        }
    }

    @Test
    fun absentOrEmptySessionsReadLegacyCookiesOnce() {
        for (header in listOf(null, "theme=dark", "maddy_session=; maddy_refresh=")) {
            var reads = 0
            val legacy = listOf("maddy_session=legacy; Path=/; Secure")
            assertEquals(legacy, WebSessionCookieMigration.cookiesToImport(header) { reads++; legacy })
            assertEquals(1, reads)
        }
    }
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
