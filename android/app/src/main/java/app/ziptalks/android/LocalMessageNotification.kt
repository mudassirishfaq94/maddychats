package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/** Device-only decrypted text. Never persisted or forwarded to FCM. */
object LocalMessageNotification {
    fun show(context: Context, notice: JSONObject) {
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        if (NativePushState.foreground || prefs.getString("user", null) != notice.optString("recipientId")) return
        if (!NotificationChannels.messagesAllowed(context)) return
        val chat = notice.optString("conversationId")
        val message = notice.optString("messageId")
        val uuid = Regex("[a-fA-F0-9-]{36}")
        if (!uuid.matches(chat) || !uuid.matches(message)) return
        val locked = NativePushState.locked(context, chat)
        val text = if (locked) mapOf("title" to "Circlo", "body" to "New message received.") else mapOf("title" to notice.optString("title"), "body" to notice.optString("body"))
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("notification_url", "ziptalks://chat/$chat?message=$message")
            data = android.net.Uri.parse("ziptalks://chat/$chat")
        }
        val tap = PendingIntent.getActivity(context, chat.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationChannels.builder(context, notice.optBoolean("silent"))
            .setSmallIcon(R.drawable.ic_stat_ic_notification)
            .setContentTitle(NativeNotificationText.title(text))
            .setContentText(NativeNotificationText.body(text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(NativeNotificationText.body(text)))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true).setAutoCancel(true).setContentIntent(tap)
        runCatching { context.getSystemService(NotificationManager::class.java)?.notify("circlo-chat-$chat", 0, builder.build()) }
    }
}
