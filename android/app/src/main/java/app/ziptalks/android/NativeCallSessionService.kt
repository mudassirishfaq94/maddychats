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
import android.media.AudioManager
import android.media.AudioDeviceInfo
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
    private fun notification(current: Session): android.app.Notification {
        val open = PendingIntent.getActivity(this, 7001, Intent(this, MainActivity::class.java).putExtra("notification_url", "ziptalks://chat/${current.conversation}?call=${current.id}"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val end = PendingIntent.getBroadcast(this, 7002, Intent(this, NativeCallEndReceiver::class.java).putExtra("callId", current.id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val caller = "Circlo audio call"
        return NotificationCompat.Builder(this, NotificationChannels.ONGOING_CALL)
            .setSmallIcon(R.drawable.ic_stat_ic_notification).setColor(0xffb9a078.toInt())
            .setContentTitle(caller).setContentText(if (connectedAt == 0L) "Connecting audio…" else if (microphoneMuted) "Microphone muted" else "Audio connected")
            .setWhen(if (connectedAt == 0L) System.currentTimeMillis() else connectedAt)
            .setUsesChronometer(connectedAt != 0L).setShowWhen(connectedAt != 0L)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOngoing(true).setSilent(true).setOnlyAlertOnce(true)
            .setContentIntent(open).setCategory(NotificationCompat.CATEGORY_CALL)
            .setStyle(NotificationCompat.CallStyle.forOngoingCall(Person.Builder().setName(caller).build(), end)).build()
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        running = this
        worker.scheduleWithFixedDelay({ maintain() }, 0, 10, TimeUnit.SECONDS)
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val current = session
        if (current == null || boundUser(this) != current.user || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return START_NOT_STICKY
        }
        NotificationChannels.ensure(this)
        NativeIncomingCall.dismiss(this, current.id)
        val notice = notification(current)
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTICE_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
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
        if (running === this) running = null
        worker.shutdownNow()
        if (wake?.isHeld == true) wake?.release()
        val ended = session?.id
        session = null
        connectedAt = 0; microphoneMuted = false
        if (Build.VERSION.SDK_INT >= 31) runCatching { getSystemService(AudioManager::class.java).clearCommunicationDevice() }
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
        @Volatile private var connectedAt: Long = 0
        @Volatile private var microphoneMuted = false
        @Volatile private var running: NativeCallSessionService? = null
        private fun owns(context: Context, data: JSONObject): Boolean {
            val current = session ?: return false
            return boundUser(context) == current.user && current.id == data.optString("callId") && current.user == data.optString("userId") && current.client == data.optString("clientId")
        }
        fun audio(context: Context, data: JSONObject): JSONObject? {
            if (!owns(context, data) || Build.VERSION.SDK_INT < 31) return null
            val manager = context.getSystemService(AudioManager::class.java)
            val devices = manager.availableCommunicationDevices
            if (data.has("deviceId")) {
                val target = devices.firstOrNull { it.id.toString() == data.optString("deviceId") } ?: return null
                if (!manager.setCommunicationDevice(target)) return null
            }
            return JSONObject().put("selected", manager.communicationDevice?.id?.toString().orEmpty()).put("devices", org.json.JSONArray().apply {
                devices.forEach { device -> put(JSONObject().put("id", device.id.toString()).put("label", when (device.type) {
                    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
                    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone earpiece"
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> "Bluetooth headset"
                    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired headphones"
                    AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE -> "USB audio"
                    else -> "Audio device"
                })) }
            })
        }
        private fun boundUser(context: Context) = context.getSharedPreferences("circlo_push", MODE_PRIVATE).getString("user", null)
        fun begin(context: Context, data: JSONObject): Boolean {
            val info = Session(data.optString("callId"), data.optString("userId"), data.optString("clientId"), data.optString("conversationId"))
            if (!NativePushState.foreground || boundUser(context) != info.user || !NativeCallPolicy.uuid(info.id) || !NativeCallPolicy.uuid(info.client) || !NativeCallPolicy.uuid(info.conversation)) return false
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false
            if (session != null && session != info) return false
            if (session == null) { connectedAt = 0; microphoneMuted = false }
            session = info; renewedAt = SystemClock.elapsedRealtime()
            return runCatching { ContextCompat.startForegroundService(context, Intent(context, NativeCallSessionService::class.java)); true }.getOrElse { session = null; false }
        }
        fun renew(context: Context, data: JSONObject): Boolean {
            session ?: return false
            if (!owns(context, data)) return false
            renewedAt = SystemClock.elapsedRealtime()
            if (data.optBoolean("connected") && connectedAt == 0L) connectedAt = System.currentTimeMillis()
            microphoneMuted = data.optBoolean("muted", microphoneMuted)
            // Refresh silently; the system chronometer advances without per-second work.
            running?.let { service -> runCatching { context.getSystemService(NotificationManager::class.java).notify(NOTICE_ID, service.notification(session ?: return false)) } }
            return true
        }
        fun stop(context: Context) { context.stopService(Intent(context, NativeCallSessionService::class.java)) }
    }
}
