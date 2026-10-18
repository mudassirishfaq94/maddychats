package app.ziptalks.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.webkit.CookieManager
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class NativeCallEndReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val current = NativeCallSessionService.session ?: return
        if (intent.getStringExtra("callId") != current.id || context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).getString("user", null) != current.user) return
        NativeCallSessionService.stop(context)
        val pending = goAsync()
        Thread {
            try {
                val cookie = CookieManager.getInstance().getCookie(BuildConfig.API_BASE_URL) ?: return@Thread
                val body = JSONObject().put("action", "end").put("id", current.id).put("clientId", current.client).toString()
                val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(3, TimeUnit.SECONDS).build()
                client.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/calls").header("Cookie", cookie).header("Origin", BuildConfig.API_BASE_URL).post(body.toRequestBody("application/json".toMediaType())).build()).execute().close()
            } catch (_: Exception) { /* Server deadlines cover an offline hang-up. */ }
            finally { pending.finish() }
        }.start()
    }
}
