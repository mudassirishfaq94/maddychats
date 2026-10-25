package app.ziptalks.android

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * A short-lived same-origin WebView lets the existing browser E2EE code use
 * this device's IndexedDB keys after FCM starts a process without an Activity.
 * Only the final, locally decrypted notification crosses the native bridge.
 */
object BackgroundNotificationPreview {
    private val main = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    private var eventId: String? = null
    private var recipientId: String? = null
    private var timeout: Runnable? = null

    fun start(context: Context, recipient: String, event: String) {
        if (!Regex("[a-fA-F0-9-]{36}").matches(recipient) || !Regex("[a-fA-F0-9-]{36}").matches(event)) return
        main.post {
            val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
            if (prefs.getString("user", null) != recipient || NativePushState.foreground) return@post
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return@post
            if (webView != null) cancelMain()

            val view = runCatching { WebView(context.applicationContext) }.getOrNull() ?: return@post
            webView = view
            eventId = event
            recipientId = recipient
            view.setBackgroundColor(Color.TRANSPARENT)
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.javaScriptCanOpenWindowsAutomatically = false
            view.settings.setSupportMultipleWindows(false)
            view.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().flush()

            WebViewCompat.addWebMessageListener(view, "CircloPush", setOf(BuildConfig.API_BASE_URL)) { source, message, origin, mainFrame, reply ->
                if (!PushPolicy.allowsBridge(mainFrame, origin.toString(), source.url.orEmpty(), BuildConfig.API_BASE_URL)) return@addWebMessageListener
                val raw = message.data ?: return@addWebMessageListener
                if (raw.length > 4096) return@addWebMessageListener
                val data = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
                if (!Regex("[a-zA-Z0-9-]{1,64}").matches(data.optString("id"))) return@addWebMessageListener
                when (data.optString("command")) {
                    "preview" -> {
                        if (data.optString("userId") != recipientId || data.optString("notificationId") != eventId) return@addWebMessageListener
                        val notice = data.optJSONObject("notification") ?: return@addWebMessageListener
                        if (notice.optString("recipientId") != recipientId || notice.optString("notificationId") != eventId) return@addWebMessageListener
                        if (notice.optString("messageText").length > 560 || notice.optString("senderName").length > 320) return@addWebMessageListener
                        if (!WebOriginPolicy.isAllowed(source.url.orEmpty(), BuildConfig.API_BASE_URL)) return@addWebMessageListener
                        if (context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).getString("user", null) != recipientId) return@addWebMessageListener
                        LocalMessageNotification.show(context, notice)
                        reply.postMessage(JSONObject().put("id", data.optString("id")).toString())
                    }
                    "preview-finished" -> {
                        if (data.optString("notificationId") != eventId) return@addWebMessageListener
                        reply.postMessage(JSONObject().put("id", data.optString("id")).toString())
                        cancelMain()
                    }
                }
            }
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    if (!WebOriginPolicy.isAllowed(url, BuildConfig.API_BASE_URL)) cancelMain()
                }
                override fun onReceivedError(view: WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
                    if (request.isForMainFrame) cancelMain()
                }
            }
            timeout = Runnable { cancelMain() }.also { main.postDelayed(it, 20_000L) }
            view.loadUrl("${BuildConfig.API_BASE_URL.trimEnd('/')}/app/notification-preview?id=$event")
        }
    }

    fun cancel() { main.post { cancelMain() } }

    private fun cancelMain() {
        timeout?.let(main::removeCallbacks)
        timeout = null
        val old = webView
        webView = null
        eventId = null
        recipientId = null
        old?.let { view ->
            runCatching {
                view.stopLoading()
                view.loadUrl("about:blank")
                view.removeAllViews()
                view.destroy()
            }
        }
    }
}
