package app.ziptalks.android

import android.app.NotificationManager
import android.content.Context

/** No message content or session credentials are kept here. */
object NativePushState {
    @Volatile var foreground = false
    fun clear(context: Context) {
        context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).edit().remove("user").apply()
        context.getSystemService(NotificationManager::class.java)?.cancelAll()
    }
    fun bind(context: Context, user: String) {
        context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE).edit().putString("user", user).apply()
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
