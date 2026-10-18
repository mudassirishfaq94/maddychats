package app.ziptalks.android

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.TimeUnit

/** Called on FCM's worker thread AFTER notification presentation. No decryption, new credential store or detached background work. */
object NativeMessageReceipt {
    private val client=OkHttpClient.Builder().addInterceptor(NativeSessionCookies).followRedirects(false).followSslRedirects(false)
        .connectTimeout(2,TimeUnit.SECONDS).callTimeout(3,TimeUnit.SECONDS).build()
    fun receive(context:Context,recipient:String?,url:String?) {
        fun bound()=context.getSharedPreferences("circlo_push",Context.MODE_PRIVATE).getString("user",null)
        if(recipient==null||bound()!=recipient)return
        val message=runCatching { android.net.Uri.parse(url.orEmpty()).getQueryParameter("message") }.getOrNull() ?: return
        if(!NativeCallPolicy.uuid(message))return
        runCatching {
            val received=client.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/messages/delivery?messageId=$message").header("Origin",BuildConfig.API_BASE_URL).build()).execute().use { response ->
                if(!response.isSuccessful)return
                JSONObject(response.body?.string().orEmpty())
            }
            if(bound()!=recipient||received.optString("recipientId")!=recipient)return
            val envelopes=received.optJSONArray("envelopes") ?: return
            if((0 until envelopes.length()).none { envelopes.optJSONObject(it)?.optString("id")==message })return
            val body=JSONObject().put("recipientId",recipient).put("messageIds",JSONArray().put(message)).toString()
            client.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/messages/delivery").header("Origin",BuildConfig.API_BASE_URL).post(body.toRequestBody("application/json".toMediaType())).build()).execute().close()
        } // Expired/revoked sessions and network failures remain undelivered until an actual retry.
    }
}
