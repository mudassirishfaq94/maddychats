package app.ziptalks.android

import org.junit.Assert.*
import org.junit.Test
import okhttp3.HttpUrl.Companion.toHttpUrl

class SessionCookiePolicyTest {
    @Test fun renewedAccessAndRefreshPersistTogetherWithoutImportingUntrustedCookies() {
        val url = "https://circlo.chat/api/calls".toHttpUrl()
        val renewed = listOf("maddy_session=new-access; Path=/; Secure; HttpOnly", "maddy_refresh=new-refresh; Path=/; Secure; HttpOnly")
        val rejected = listOf("maddy_session=other; Domain=attacker.example; Secure; HttpOnly", "maddy_refresh=insecure; HttpOnly", "maddy_session=script-readable; Secure", "theme=dark; Secure; HttpOnly")
        assertEquals(renewed, SessionCookiePolicy.updates("current", "current", url, renewed + rejected))
        assertEquals(emptyList<String>(), SessionCookiePolicy.updates("current", "signed-out", url, renewed))
    }
    @Test fun lateRefreshCannotRestoreLoggedOutOrSwitchedAccount() {
        val sent = "maddy_session=account-a; maddy_refresh=old"
        assertTrue(SessionCookiePolicy.canSave(sent, sent))
        assertFalse(SessionCookiePolicy.canSave(sent, null))
        assertFalse(SessionCookiePolicy.canSave(sent, ""))
        assertFalse(SessionCookiePolicy.canSave(sent, "maddy_session=account-b; maddy_refresh=new"))
        assertFalse(SessionCookiePolicy.canSave(sent, "maddy_session=account-a; maddy_refresh=renewed"))
        assertFalse(SessionCookiePolicy.canSave(null, null))
    }
    @Test fun renewalOnlyAcceptsExactAuthenticationCookieNames() {
        assertTrue(SessionCookiePolicy.isSessionCookie("maddy_session"))
        assertTrue(SessionCookiePolicy.isSessionCookie("maddy_refresh"))
        assertFalse(SessionCookiePolicy.isSessionCookie("session"))
        assertFalse(SessionCookiePolicy.isSessionCookie("maddy_refresh_attacker"))
    }
}
