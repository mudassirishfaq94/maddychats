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
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(view, "CircloPush", setOf(BuildConfig.API_BASE_URL)) { source, message, origin, mainFrame, reply ->
            if (!PushPolicy.allowsBridge(mainFrame, origin.toString(), source.url.orEmpty(), BuildConfig.API_BASE_URL)) return@addWebMessageListener
            val raw = runCatching { message.data }.getOrNull() ?: return@addWebMessageListener
            if (raw.length > 512) return@addWebMessageListener
            val data = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
            val id = data.optString("id")
            if (!Regex("[a-zA-Z0-9-]{1,64}").matches(id)) return@addWebMessageListener
            fun respond(token: String? = null, error: String? = null) {
                if (!WebOriginPolicy.isAllowed(source.url.orEmpty(), BuildConfig.API_BASE_URL) || activity.isDestroyed) return
                val result = JSONObject().put("id", id)
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
                "token" -> token()
                "request" -> requestPermission { token() }
                "clear" -> { NativePushState.clear(activity); respond() }
                "bind" -> {
                    val user = data.optString("userId")
                    if (Regex("[a-fA-F0-9-]{36}").matches(user)) { NativePushState.bind(activity, user); respond() }
                    else respond(error = "Invalid account.")
                }
                else -> respond(error = "Unsupported notification command.")
            }
        }
    }
}
