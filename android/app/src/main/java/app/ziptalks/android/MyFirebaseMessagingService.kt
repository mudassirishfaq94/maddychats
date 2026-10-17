package app.ziptalks.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Drop other accounts, expired events and duplicates before displaying the approved preview.
        if (!NativePushState.accept(this, remoteMessage.data["recipientId"], remoteMessage.data["eventId"], remoteMessage.data["expiresAt"])) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        // Quiet activity must never bypass a user-blocked Messages channel.
        if (!NotificationChannels.messagesAllowed(this)) return
        val title = NativeNotificationText.title(remoteMessage.data)
        val body = NativeNotificationText.body(remoteMessage.data)
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

        val silent = remoteMessage.data["silent"] == "true"
        val builder = NotificationChannels.builder(this, silent)
            .setSmallIcon(R.drawable.ic_stat_ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)


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
