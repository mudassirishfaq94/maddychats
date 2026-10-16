package app.ziptalks.android

import android.content.Context
import android.webkit.CookieManager
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Bounded token-refresh request, no polling, new credentials or persisted cookie copies. */
object NativeTokenSync {
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .callTimeout(8, TimeUnit.SECONDS).build()
    fun refresh(context: Context, token: String) {
        // Do not enroll a signed-out/restricted account in a background callback.
        if (context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).getString("user", null) == null) return
        if (token.length !in 10..4096) return
        runCatching {
            val cookie = CookieManager.getInstance().getCookie(BuildConfig.API_BASE_URL) ?: return
            val body = JSONObject().put("token", token).put("platform", "android-webview-v1").toString()
            val request = Request.Builder().url("${BuildConfig.API_BASE_URL}/api/push/register")
                .header("Origin", BuildConfig.API_BASE_URL).header("Cookie", cookie)
                .post(body.toRequestBody("application/json".toMediaType())).build()
            // The server verifies session approval/revocation and derives its owner.
            // Never follow redirects with cookies, log tokens or persist credentials.
            client.newCall(request).execute().use { /* Resume also retries an expired/failed registration. */ }
        }
    }
}
