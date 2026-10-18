package app.ziptalks.android

import android.app.NotificationManager
import android.content.Context

/** No message content or session credentials are kept here. */
object NativePushState {
    @Volatile var foreground = false
    @Volatile var previewWebView: java.lang.ref.WeakReference<android.webkit.WebView>? = null
    fun requestPreview(recipient: String?, event: String?) {
        if (recipient == null || event == null) return
        val view = previewWebView?.get() ?: return
        view.post {
            if (!WebOriginPolicy.isAllowed(view.url.orEmpty(), BuildConfig.API_BASE_URL)) return@post
            val detail = org.json.JSONObject().put("recipientId", recipient).put("notificationId", event)
            view.evaluateJavascript("window.dispatchEvent(new CustomEvent('circlo:native-notification', {detail: $detail}))", null)
        }
    }
    fun dismiss(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancelAll()
    }
    fun clear(context: Context) {
        context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).edit().remove("user").apply()
        context.getSystemService(NotificationManager::class.java)?.cancelAll()
    }
    fun bind(context: Context, user: String) {
        context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).edit().putString("user", user).apply()
    }
    fun callClosed(context: Context, call: String): Boolean {
        val prefs=context.getSharedPreferences("circlo_push",Context.MODE_PRIVATE)
        val user=prefs.getString("user",null) ?: return true
        return call in prefs.getString("closed_calls_$user","").orEmpty().split("|")
    }
    @Synchronized fun closeCall(context: Context, call: String) {
        val prefs=context.getSharedPreferences("circlo_push",Context.MODE_PRIVATE)
        val user=prefs.getString("user",null) ?: return
        val ids=prefs.getString("closed_calls_$user","").orEmpty().split("|").filter{it.isNotEmpty() && it!=call}.takeLast(99)+call
        prefs.edit().putString("closed_calls_$user",ids.joinToString("|")).apply()
    }
    fun locked(context: Context, chat: String): Boolean {
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        val user = prefs.getString("user", null) ?: return true
        val ids = runCatching { org.json.JSONArray(prefs.getString("locks_$user", "null")) }.getOrNull() ?: return true
        return (0 until ids.length()).any { ids.optString(it) == chat }
    }
    @Synchronized fun accept(context: Context, recipient: String?, event: String?, expires: String?): Boolean {
        if (recipient == null || event == null) return false
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        if (!PushPolicy.acceptsEvent(prefs.getString("user", null), recipient, event, expires?.toLongOrNull() ?: 0, System.currentTimeMillis(), foreground)) return false
        val seen = prefs.getString("events", "").orEmpty().split("|").filter { it.isNotEmpty() }
        if (event in seen) return false
        prefs.edit().putString("events", (seen.takeLast(99) + event).joinToString("|")).apply()
        return true
    }
}
