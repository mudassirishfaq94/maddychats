package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.Person

/** No full-screen intent or background microphone is requested by this WebView build. */
object NativeIncomingCall {
    fun show(context: Context, data: Map<String, String>) {
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        if (prefs.getString("user", null) != data["recipientId"]) return
        val call = data["callId"] ?: return
        if (!Regex("[a-fA-F0-9-]{36}").matches(call)) return
        val tag = "circlo-call-$call"
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (data["callCancelled"] == "true") { NativePushState.closeCall(context,call); manager.cancel(tag, 0); return }
        if (NativePushState.callClosed(context,call)) return
        val expires = data["expiresAt"]?.toLongOrNull() ?: return
        if (!NativePushState.accept(context, data["recipientId"], data["eventId"], data["expiresAt"])) return
        NotificationChannels.ensure(context)
        if (!androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        val url = data["url"] ?: return
        fun open(action: String): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("notification_url", url + if (action.isEmpty()) "" else "&callAction=$action")
                this.data = android.net.Uri.parse("ziptalks://chat/call/$call/$action")
            }
            return PendingIntent.getActivity(context, (call+action).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val decline = PendingIntent.getBroadcast(context, call.hashCode(), Intent(context, NativeCallDeclineReceiver::class.java).apply {
            putExtra("callId",call); putExtra("recipientId",data["recipientId"])
        }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(context, NotificationChannels.CALLS)
            .setSmallIcon(R.drawable.ic_stat_ic_notification).setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentTitle("Incoming Circlo call").setContentText("Open Circlo to answer.")
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(Person.Builder().setName("Circlo contact").build(), decline, open("answer")))
            .setContentIntent(open("")).setAutoCancel(true).setOnlyAlertOnce(true)
            .setTimeoutAfter((expires-System.currentTimeMillis()).coerceIn(1,45000)).setSilent(data["silent"] == "true")
        runCatching { manager.notify(tag,0,builder.build()) }
    }
}
