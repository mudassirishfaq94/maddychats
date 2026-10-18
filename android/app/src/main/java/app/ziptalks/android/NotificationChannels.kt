package app.ziptalks.android

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/** Existing Messages ID is permanent. Never delete/recreate channels to reset user choices. */
object NotificationChannels {
    const val CALLS = "circlo-incoming-calls"
    const val MESSAGES = "maddychats-messages"
    // A genuinely separate, non-interrupting purpose; never used to bypass Messages settings.
    const val QUIET = "circlo-quiet-activity"
    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CALLS) == null) manager.createNotificationChannel(NotificationChannel(CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Incoming Circlo audio calls"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            enableVibration(true)
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
        })
        if (manager.getNotificationChannel(MESSAGES) == null) {
            manager.createNotificationChannel(NotificationChannel(MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "New messages when Circlo is in the background"
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                enableVibration(true)
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
            })
        }
        if (manager.getNotificationChannel(QUIET) == null) {
            manager.createNotificationChannel(NotificationChannel(QUIET, "Quiet activity", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Non-interrupting updates when notification sound is turned off"
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                setSound(null, null)
                enableVibration(false)
            })
        }
    }
    fun messagesAllowed(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT < 26) return true
        return context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(MESSAGES)?.importance != NotificationManager.IMPORTANCE_NONE
    }
    fun builder(context: Context, silent: Boolean): NotificationCompat.Builder {
        ensure(context)
        val result = NotificationCompat.Builder(context, if (silent) QUIET else MESSAGES)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(if (silent) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(silent)
            .setSilent(silent)
        if (!silent && Build.VERSION.SDK_INT < 26) result.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
        return result
    }
    fun status(context: Context): JSONObject {
        ensure(context)
        val importance = if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(MESSAGES)?.importance else null
        return JSONObject().put("enabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
            .put("messagesImportance", importance ?: JSONObject.NULL)
    }
    fun openSettings(context: Context) {
        ensure(context)
        val intent = if (Build.VERSION.SDK_INT >= 26) {
            if (NotificationManagerCompat.from(context).areNotificationsEnabled()) Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, MESSAGES)
            else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }.getOrElse {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
