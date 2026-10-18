package app.ziptalks.android

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Only an explicitly answered/started call may own this microphone foreground service.
 * No SDP, media, private keys or cookies are persisted by this service. */
class NativeCallSessionService : Service() {
    data class Session(val id: String, val user: String, val client: String, val conversation: String)
    private val worker = Executors.newSingleThreadScheduledExecutor()
    private val http = OkHttpClient.Builder().addInterceptor(NativeSessionCookies).followRedirects(false).followSslRedirects(false).callTimeout(3, TimeUnit.SECONDS).build()
    private var wake: PowerManager.WakeLock? = null
    private var endMediaOnStop = true
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        worker.scheduleWithFixedDelay({ maintain() }, 0, 10, TimeUnit.SECONDS)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val current = session
        if (current == null || boundUser(this) != current.user || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return START_NOT_STICKY
        }
        NotificationChannels.ensure(this)
        NativeIncomingCall.dismiss(this, current.id)
        val open = PendingIntent.getActivity(this, 7001, Intent(this, MainActivity::class.java).putExtra("notification_url", "ziptalks://chat/${current.conversation}?call=${current.id}"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val end = PendingIntent.getBroadcast(this, 7002, Intent(this, NativeCallEndReceiver::class.java).putExtra("callId", current.id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notice = NotificationCompat.Builder(this, NotificationChannels.ONGOING_CALL)
            .setSmallIcon(R.drawable.ic_stat_ic_notification).setContentTitle("Circlo audio call")
            .setContentText("Microphone in use. Tap to return to the call.")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOngoing(true).setSilent(true)
            .setContentIntent(open).setCategory(NotificationCompat.CATEGORY_CALL)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(Person.Builder().setName("Circlo contact").build(), end)).build()
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(NOTICE_ID, notice)
            if (wake == null) wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "circlo:active-call").apply { setReferenceCounted(false) }
        } catch (_: Exception) { endMediaOnStop = false; stopSelf() }
        return START_NOT_STICKY
    }
    private fun maintain() {
        val current = session ?: return
        // A dead WebView must never keep a microphone notification/call alive indefinitely.
        if (boundUser(this) != current.user || SystemClock.elapsedRealtime() - renewedAt > 45000) { stopSelf(); return }
        runCatching { wake?.acquire(45000) }
        try {
            val cookie = CookieManager.getInstance().getCookie(BuildConfig.API_BASE_URL) ?: run { stopSelf(); return }
            val response = http.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/calls").header("Cookie", cookie).header("X-Call-Client", current.client).build()).execute()
            val live = response.use {
                if (it.code == 401 || it.code == 403) { stopSelf(); return }
                if (!it.isSuccessful) return else JSONObject(it.body?.string().orEmpty()).optJSONObject("call")
            }
            if (live == null || live.optString("id") != current.id || !live.optBoolean("owned")) { stopSelf(); return }
            if (live.optString("state") == "active") {
                val body = JSONObject().put("action", "heartbeat").put("id", current.id).put("clientId", current.client).toString()
                http.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/calls").header("Cookie", cookie).header("Origin", BuildConfig.API_BASE_URL).post(body.toRequestBody("application/json".toMediaType())).build()).execute().close()
            }
        } catch (_: Exception) { /* Temporary offline intervals retain the existing bounded lease. */ }
    }
    override fun onDestroy() {
        worker.shutdownNow()
        if (wake?.isHeld == true) wake?.release()
        val ended = session?.id
        session = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        NativePushState.previewWebView?.get()?.let { view -> view.post {
            if (WebOriginPolicy.isAllowed(view.url.orEmpty(), BuildConfig.API_BASE_URL)) {
                val detail = JSONObject().put("callId", ended)
                val event = if (endMediaOnStop) "circlo:native-call-ended" else "circlo:native-call-unprotected"
                view.evaluateJavascript("window.dispatchEvent(new CustomEvent('$event', {detail: $detail}))", null)
            }
        } }
        super.onDestroy()
    }
    companion object {
        private const val NOTICE_ID = 7003
        @Volatile var session: Session? = null; private set
        @Volatile private var renewedAt: Long = 0
        private fun boundUser(context: Context) = context.getSharedPreferences("circlo_push", MODE_PRIVATE).getString("user", null)
        fun begin(context: Context, data: JSONObject): Boolean {
            val info = Session(data.optString("callId"), data.optString("userId"), data.optString("clientId"), data.optString("conversationId"))
            if (!NativePushState.foreground || boundUser(context) != info.user || !NativeCallPolicy.uuid(info.id) || !NativeCallPolicy.uuid(info.client) || !NativeCallPolicy.uuid(info.conversation)) return false
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false
            if (session != null && session != info) return false
            session = info; renewedAt = SystemClock.elapsedRealtime()
            return runCatching { ContextCompat.startForegroundService(context, Intent(context, NativeCallSessionService::class.java)); true }.getOrElse { session = null; false }
        }
        fun renew(data: JSONObject): Boolean {
            val current = session ?: return false
            if (current.id != data.optString("callId") || current.user != data.optString("userId") || current.client != data.optString("clientId")) return false
            renewedAt = SystemClock.elapsedRealtime(); return true
        }
        fun stop(context: Context) { context.stopService(Intent(context, NativeCallSessionService::class.java)) }
    }
}
