package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import android.os.Build
import android.app.Notification

/** FCM can display this without any WebView/JS process; microphone starts only after Answer. */
object NativeIncomingCall {
    fun dismiss(context: Context, call: String) {
        context.getSystemService(NotificationManager::class.java)?.cancel("circlo-call-$call", 0)
    }
    fun show(context: Context, data: Map<String, String>) {
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        if (prefs.getString("user", null) != data["recipientId"]) return
        val call = data["callId"] ?: return
        if (!NativeCallPolicy.uuid(call)) return
        val tag = "circlo-call-$call"
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (data["callCancelled"] == "true") { NativePushState.closeCall(context,call); manager.cancel(tag, 0); return }
        if (NativePushState.callClosed(context,call)) return
        val expires = data["expiresAt"]?.toLongOrNull() ?: return
        val url = data["url"] ?: return
        if (!NativeCallPolicy.valid(prefs.getString("user",null), data["recipientId"], call, url, expires, System.currentTimeMillis())) return
        if (!NativePushState.accept(context, data["recipientId"], data["eventId"], data["expiresAt"])) return
        NotificationChannels.ensure(context)
        if (!androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(NotificationChannels.CALLS)?.importance == NotificationManager.IMPORTANCE_NONE) return
        fun open(action: String): PendingIntent {
            val intent = Intent(context, if (action == "answer") IncomingCallActivity::class.java else MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("notification_url", url + if (action.isEmpty()) "" else "&callAction=$action")
                if (action == "answer") {
                    putExtra("callId", call); putExtra("recipientId", data["recipientId"])
                    putExtra("callUrl", url); putExtra("expiresAt", expires)
                    putExtra("answerRequested", true)
                }
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
        // Eligibility and the user's full-screen setting are respected. Otherwise
        // Android presents the same Answer/Decline heads-up notification.
        if (data["silent"] != "true" && (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())) {
            val fullScreen = Intent(context, IncomingCallActivity::class.java).apply {
                putExtra("callId",call); putExtra("recipientId",data["recipientId"])
                putExtra("callUrl",url); putExtra("expiresAt",expires)
            }
            builder.setFullScreenIntent(PendingIntent.getActivity(context, call.hashCode(), fullScreen, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE), true)
        }
        val notice = builder.build()
        if (data["silent"] != "true") notice.flags = notice.flags or Notification.FLAG_INSISTENT
        runCatching { manager.notify(tag,0,notice) }
    }
}
