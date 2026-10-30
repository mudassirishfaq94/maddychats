package app.ziptalks.android

import android.content.Context
import android.util.Base64
import android.webkit.CookieManager
import org.json.JSONObject
import java.security.MessageDigest

/** Only an account/session hint and a one-way cookie digest; no credentials or message keys.
 * The packaged surface remains read-only. The hosted app independently reauthorizes,
 * and login/device-approval responses remove the surface and this binding.
 */
internal object NativeStartupSnapshot {
    private fun preferences(context: Context) = context.getSharedPreferences("circlo-startup-binding", Context.MODE_PRIVATE)
    private fun cookie(header: String, name: String) = header.split(';').map { it.trim() }
        .firstOrNull { it.startsWith("$name=") }?.substringAfter('=')?.takeIf { it.isNotBlank() && it.length <= 8192 }
    private fun claims(token: String): JSONObject {
        val parts = token.split('.')
        require(parts.size == 3)
        return JSONObject(String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8))
    }
    private fun digest(refresh: String) = MessageDigest.getInstance("SHA-256")
        .digest(refresh.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun header() = CookieManager.getInstance().getCookie(BuildConfig.API_BASE_URL).orEmpty()

    /** Called only by the existing same-origin bind command after hosted authentication. */
    fun record(context: Context, authenticatedUser: String) = runCatching {
        val cookies = header()
        val token = claims(cookie(cookies, "maddy_session") ?: return@runCatching)
        val user = token.optString("sub")
        val session = token.optString("sid")
        val now = System.currentTimeMillis()
        if (user != authenticatedUser || !StartupSnapshotPolicy.eligible(user, session, token.optLong("exp"), token.optBoolean("devicePending"), now)) return@runCatching
        val refresh = cookie(cookies, "maddy_refresh") ?: return@runCatching
        preferences(context).edit().putString("binding", JSONObject().put("user", user).put("session", session)
            .put("digest", digest(refresh)).put("recorded", now).toString()).apply()
    }.let { Unit }

    fun account(context: Context, onlyBinding: Boolean = false): String? = runCatching {
        val cookies = header()
        val access = cookie(cookies, "maddy_session")?.let { claims(it) }
        val now = System.currentTimeMillis()
        if (!onlyBinding && access != null && StartupSnapshotPolicy.eligible(access.optString("sub"), access.optString("sid"), access.optLong("exp"), access.optBoolean("devicePending"), now)) return@runCatching access.optString("sub")
        val refresh = cookie(cookies, "maddy_refresh") ?: return@runCatching null
        val saved = JSONObject(preferences(context).getString("binding", null) ?: return@runCatching null)
        if (!StartupSnapshotBindingPolicy.eligible(saved.optString("user"), saved.optString("session"), saved.optString("digest"), saved.optLong("recorded"), digest(refresh),
                access?.optString("sub"), access?.optString("sid"), access?.optBoolean("devicePending") ?: false, now)) return@runCatching null
        saved.optString("user")
    }.getOrNull()

    fun clear(context: Context) { preferences(context).edit().clear().apply() }
}
