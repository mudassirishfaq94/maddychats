package app.ziptalks.android

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.Interceptor
import okhttp3.HttpUrl
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Native background requests share WebView's existing HttpOnly session jar.
 * No second credential store, logging, or relaxed refresh/revocation rules. */
object NativeSessionCookies : Interceptor {
    private val lock = Any()
    private val saver = Executors.newSingleThreadExecutor()
    private val queued = AtomicBoolean(false)
    fun persist() {
        if (!queued.compareAndSet(false, true)) return
        saver.execute {
            try { synchronized(lock) { runCatching { CookieManager.getInstance().flush() } } }
            finally { queued.set(false) }
        }
    }
    override fun intercept(chain: Interceptor.Chain): Response = synchronized(lock) {
        val original = chain.request()
        if (!WebOriginPolicy.isAllowed(original.url.toString(), BuildConfig.API_BASE_URL)) throw IOException("Untrusted session destination")
        val jar = CookieManager.getInstance()
        val sent = jar.getCookie(BuildConfig.API_BASE_URL) ?: throw IOException("Session unavailable")
        val response = chain.proceed(original.newBuilder().header("Cookie", sent).build())
        // A newer browser refresh, logout, or account switch wins over an
        // in-flight native response. Concurrent native rotations are serialized.
        val updates = SessionCookiePolicy.updates(sent, jar.getCookie(BuildConfig.API_BASE_URL), original.url, response.headers("Set-Cookie"))
        if (updates.isNotEmpty()) {
            updates.forEach { jar.setCookie(BuildConfig.API_BASE_URL, it) }
            runCatching { jar.flush() }
        }
        response
    }
}

internal object SessionCookiePolicy {
    fun canSave(sent: String?, current: String?) = !sent.isNullOrBlank() && sent == current
    fun isSessionCookie(name: String) = name == "maddy_session" || name == "maddy_refresh"
    fun updates(sent: String?, current: String?, url: HttpUrl, headers: List<String>): List<String> {
        if (!canSave(sent, current)) return emptyList()
        return headers.filter { header ->
            val cookie = Cookie.parse(url, header)
            cookie != null && isSessionCookie(cookie.name) && cookie.matches(url) && cookie.secure && cookie.httpOnly
        }
    }
}
