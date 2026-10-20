package app.ziptalks.android

import android.Manifest
import android.os.Build
import android.content.pm.PackageManager
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

/** Exact HTTPS origin and main-frame restriction, including asynchronous responses. */
class HostedPushBridge(private val activity: MainActivity, private val requestPermission: (() -> Unit) -> Unit) {
    fun install(view: WebView) {
        NativePushState.previewWebView = java.lang.ref.WeakReference(view)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(view, "CircloPush", setOf(BuildConfig.API_BASE_URL)) { source, message, origin, mainFrame, reply ->
            if (!PushPolicy.allowsBridge(mainFrame, origin.toString(), source.url.orEmpty(), BuildConfig.API_BASE_URL)) return@addWebMessageListener
            val raw = runCatching { message.data }.getOrNull() ?: return@addWebMessageListener
            if (raw.length > 4096) return@addWebMessageListener
            val data = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
            val id = data.optString("id")
            if (!Regex("[a-zA-Z0-9-]{1,64}").matches(id)) return@addWebMessageListener
            fun respond(token: String? = null, error: String? = null, status: JSONObject? = null, audio: JSONObject? = null) {
                if (!WebOriginPolicy.isAllowed(source.url.orEmpty(), BuildConfig.API_BASE_URL) || activity.isDestroyed) return
                val result = JSONObject().put("id", id)
                status?.let { result.put("status", it) }
                audio?.let { result.put("audio", it) }
                token?.let { result.put("token", it) }; error?.let { result.put("error", it) }
                runCatching { reply.postMessage(result.toString()) }
            }
            fun token() {
                val permitted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                if (!permitted || !NotificationManagerCompat.from(activity).areNotificationsEnabled()) { respond(); return }
                runCatching {
                    FirebaseMessaging.getInstance().token.addOnCompleteListener(activity) { task ->
                        if (task.isSuccessful) respond(task.result) else respond(error = "Notifications unavailable. Please retry later.")
                    }
                }.onFailure { respond(error = "Notifications are not configured for this Android build.") }
            }
            when (data.optString("command")) {
                "call-answer" -> {
                    val accepted = NativeCallActions.valid(activity, data.optString("callId"), data.optString("actionToken"), true)
                    android.util.Log.i("CircloCall", "Answer proof consumed=$accepted")
                    respond(token = if (accepted) "active" else "unavailable")
                }
                "call-start" -> respond(token = if (NativeCallSessionService.begin(activity, data)) "active" else "unavailable")
                "call-renew" -> respond(token = if (NativeCallSessionService.renew(activity, data)) "active" else "unavailable")
                "call-audio" -> runCatching { NativeCallSessionService.audio(activity, data) }
                    .onSuccess { if (it == null) respond(error = "Call audio controls are unavailable.") else respond(audio = it) }
                    .onFailure { respond(error = "Could not change audio output. Try again.") }
                "call-stop" -> {
                    val call = NativeCallSessionService.session
                    if (call != null && call.id == data.optString("callId") && call.user == data.optString("userId") && call.client == data.optString("clientId")) NativeCallSessionService.stop(activity)
                    respond()
                }
                "call-settings" -> { NotificationChannels.openCallSettings(activity); respond() }
                "settings" -> { runCatching { NotificationChannels.openSettings(activity) }.onSuccess { respond() }.onFailure { respond(error = "Open Android Settings > Apps > Circlo > Notifications.") } }
                "status" -> respond(status = NotificationChannels.status(activity))
                "token" -> token()
                "request" -> requestPermission { token() }
                "privacy" -> {
                    val user = data.optString("userId")
                    val prefs = activity.getSharedPreferences("circlo_push", android.content.Context.MODE_PRIVATE)
                    if (prefs.getString("user", null) == user) {
                        val locks = data.optJSONArray("lockedChats")?.toString() ?: "null"
                        val changed = prefs.getString("locks_$user", "null") != locks
                        prefs.edit().putString("locks_$user", locks).apply()
                        NativePushState.dismiss(activity)
                        if (changed) NativePushState.hideLockedCalls(activity)
                    }
                    respond()
                }
                "dismiss" -> { NativePushState.dismiss(activity); respond() }
                "preview" -> {
                    val notice = data.optJSONObject("notification")
                    if (notice != null) LocalMessageNotification.show(activity, notice)
                    respond()
                }
                "clear" -> { NativePushState.clear(activity); respond() }
                "reconcile" -> {
                    val user = data.optString("userId")
                    if (NativeCallPolicy.uuid(user)) { NativePushState.prepareUser(activity, user); respond() }
                    else respond(error = "Invalid account.")
                }
                "bind" -> {
                    val user = data.optString("userId")
                    if (Regex("[a-fA-F0-9-]{36}").matches(user)) { NativePushState.bind(activity, user); NativeSessionCookies.persist(); respond() }
                    else respond(error = "Invalid account.")
                }
                else -> respond(error = "Unsupported notification command.")
            }
        }
    }
}
