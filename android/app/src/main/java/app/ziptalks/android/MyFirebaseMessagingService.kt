package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_ID = "maddychats-messages"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Drop other accounts, expired events and duplicates; never display provider plaintext.
        if (!NativePushState.accept(this, remoteMessage.data["recipientId"], remoteMessage.data["eventId"], remoteMessage.data["expiresAt"])) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val title = "Circlo"
        val body = "New activity. Open Circlo to view it."
        val url = remoteMessage.data["url"]
        val tag = remoteMessage.data["tag"]

        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            url?.let { putExtra("notification_url", it); data = android.net.Uri.parse(it).buildUpon().clearQuery().build() }
        }

        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        val pendingIntent = PendingIntent.getActivity(
            this, tag?.hashCode() ?: 0, intent, pendingIntentFlags
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setSilent(remoteMessage.data["silent"] == "true")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setVibrate(longArrayOf(100, 50, 100))

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        notificationManager?.notify(
            tag ?: "circlo-messages", 0,
            builder.build()
        )
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Firebase invokes this callback off the UI thread. Bound work to eight
        // seconds; failed/expired-session registration is retried on resume.
        NativeTokenSync.refresh(this, token)
    }
}
