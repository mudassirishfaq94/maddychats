package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.os.Build
import android.os.SystemClock
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        val callbackStartedAt = SystemClock.elapsedRealtime()

        if (remoteMessage.data["callId"] != null) {
            android.util.Log.i("CircloCall", "Call push received; cancelled=${remoteMessage.data["callCancelled"] == "true"}")
            NativeIncomingCall.show(this, remoteMessage.data)
            return
        }
        try {
        val pushSentAt = remoteMessage.data["pushSentAtMs"]?.toLongOrNull()
        if (pushSentAt != null) {
            val elapsed = System.currentTimeMillis() - pushSentAt
            if (elapsed in 0L..3_600_000L) android.util.Log.i("CircloPushMetrics", "fcm_to_android_callback_ms=$elapsed")
        }
        // Drop other accounts, expired events and duplicates before displaying the approved preview.
        if (!NativePushState.accept(this, remoteMessage.data["recipientId"], remoteMessage.data["eventId"], remoteMessage.data["expiresAt"])) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        // Quiet activity must never bypass a user-blocked Messages channel.
        if (!NotificationChannels.messagesAllowed(this)) return
        val isCall = remoteMessage.data["url"]?.contains("?call=") == true
        val chat = android.net.Uri.parse(remoteMessage.data["url"].orEmpty()).pathSegments.firstOrNull().orEmpty()
        val request = remoteMessage.data["messageRequest"] == "true"
        // Message preview settings are explicit: chat-lock UI state must not
        // silently hide previews from the system notification.
        val senderName = remoteMessage.data["actorName"]
            ?.takeIf { remoteMessage.data["showDetails"] == "true" }
        val groupName = remoteMessage.data["groupName"]?.takeIf { remoteMessage.data["showDetails"] == "true" }
        val title = if (isCall) NativeNotificationText.title(remoteMessage.data) else NativeMessagePrivacy.title(request, false, senderName, groupName)
        val showDetails = remoteMessage.data["showDetails"] == "true"
        val messageKind = remoteMessage.data["messageKind"]?.takeIf { showDetails } ?: "text"
        val body = if (isCall) NativeNotificationText.body(remoteMessage.data) else NativeMessagePrivacy.body(request, false, messageKind, senderName, remoteMessage.data["isGroup"] == "true", showDetails)
        val url = remoteMessage.data["url"]
        val tag = remoteMessage.data["tag"]
        val message = android.net.Uri.parse(url.orEmpty()).getQueryParameter("message")
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val previous = notificationManager?.activeNotifications?.firstOrNull { it.tag == tag }
        if (message != null && previous?.notification?.extras?.getString("circlo.message") == message && previous.notification.extras.getBoolean("circlo.preview")) return

        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            url?.let { putExtra("notification_url", it); data = android.net.Uri.parse(it).buildUpon().clearQuery().build() }
        }

        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val pendingIntent = PendingIntent.getActivity(
            this, tag?.hashCode() ?: 0, intent, pendingIntentFlags
        )

        val silent = remoteMessage.data["silent"] == "true"
        val builder = NotificationChannels.builder(this, silent)
            .addExtras(android.os.Bundle().apply { putString("circlo.message", message) })
            .setSmallIcon(R.drawable.ic_stat_ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(false)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)


        notificationManager?.notify(
            tag ?: "circlo-messages", 0,
            builder.build()
        )
        android.util.Log.i("CircloPushMetrics", "android_callback_to_notify_ms=${SystemClock.elapsedRealtime() - callbackStartedAt}")
        if (!isCall && showDetails) NativePushState.requestPreview(this, remoteMessage.data["recipientId"], remoteMessage.data["eventId"])
        } finally { NativeMessageReceipt.receive(this, remoteMessage.data["recipientId"], remoteMessage.data["url"]) }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Firebase invokes this callback off the UI thread. Bound work to eight
        // seconds; failed/expired-session registration is retried on resume.
        NativeTokenSync.refresh(this, token)
    }
}
