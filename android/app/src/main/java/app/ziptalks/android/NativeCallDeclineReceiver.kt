package app.ziptalks.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.NotificationManager
import android.webkit.CookieManager
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class NativeCallDeclineReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val call = intent.getStringExtra("callId") ?: return
        val recipient = intent.getStringExtra("recipientId") ?: return
        if (!Regex("[a-fA-F0-9-]{36}").matches(call) || context.getSharedPreferences("circlo_push",Context.MODE_PRIVATE).getString("user",null) != recipient) return
        NativePushState.closeCall(context,call)
        context.getSystemService(NotificationManager::class.java)?.cancel("circlo-call-$call",0)
        val pending = goAsync()
        Thread {
            try {
                val cookie = CookieManager.getInstance().getCookie(BuildConfig.API_BASE_URL) ?: return@Thread
                val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(3,TimeUnit.SECONDS).build()
                val request = Request.Builder().url("${BuildConfig.API_BASE_URL}/api/calls").header("Cookie",cookie).build()
                val live = client.newCall(request).execute().use { if (!it.isSuccessful) return@Thread else JSONObject(it.body?.string().orEmpty()).optJSONObject("call") } ?: return@Thread
                if (live.optString("id") != call || live.optString("callee_id") != recipient || live.optString("state") != "ringing") return@Thread
                val body = JSONObject().put("action","end").put("id",call).put("clientId",java.util.UUID.randomUUID().toString()).toString()
                client.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/calls").header("Cookie",cookie).header("Origin",BuildConfig.API_BASE_URL)
                    .post(body.toRequestBody("application/json".toMediaType())).build()).execute().close()
            } catch (_: Exception) { /* Offline decline is local; the server ringing deadline still expires. */ }
            finally { pending.finish() }
        }.start()
    }
}
