package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
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
        val text = if (locked) mapOf("title" to "Circlo", "body" to NativeMessagePrivacy.body(false, true)) else mapOf("title" to notice.optString("title"), "body" to notice.optString("body"))
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("notification_url", "ziptalks://chat/$chat?message=$message")
            data = android.net.Uri.parse("ziptalks://chat/$chat")
        }
        val tap = PendingIntent.getActivity(context, chat.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val manager = context.getSystemService(NotificationManager::class.java)
        val tag = "circlo-chat-$chat"
        val previous = manager?.activeNotifications?.firstOrNull { it.tag == tag }
        val sameMessage = previous?.notification?.extras?.getString("circlo.message") == message
        val preview = !locked && notice.optBoolean("messagePreview")
        val style: NotificationCompat.Style = if (preview) NotificationCompat.MessagingStyle(Person.Builder().setName("You").build()).also { conversation ->
            val group = notice.optBoolean("isGroup")
            conversation.setGroupConversation(group)
            if (group) conversation.setConversationTitle(NativeNotificationText.title(text).removeSuffix(" · Circlo"))
            val sender = NativeNotificationText.title(mapOf("title" to notice.optString("senderName")))
            val body = NativeNotificationText.body(mapOf("body" to notice.optString("messageText", notice.optString("body"))))
            conversation.addMessage(body, System.currentTimeMillis(), Person.Builder().setName(sender).setIcon(IconCompat.createWithBitmap(NativeContactAvatar.create(sender))).build())
        } else NotificationCompat.BigTextStyle().bigText(NativeNotificationText.body(text))
        val builder = NotificationChannels.builder(context, notice.optBoolean("silent"))
            .addExtras(android.os.Bundle().apply { putString("circlo.message", message); putBoolean("circlo.preview", preview) })
            .setSmallIcon(R.drawable.ic_stat_ic_notification)
            .setColor(0xffb9a078.toInt())
            .setContentTitle(NativeNotificationText.title(text))
            .setContentText(NativeNotificationText.body(text))
            .setStyle(style)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(sameMessage).setAutoCancel(true).setContentIntent(tap)
        if (preview) builder.setLargeIcon(NativeContactAvatar.create(if (notice.optBoolean("isGroup")) NativeNotificationText.title(text) else notice.optString("senderName")))
        runCatching { manager?.notify(tag, 0, builder.build()) }
    }
}
