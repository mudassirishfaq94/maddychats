package app.ziptalks.android

import android.app.Notification
import android.app.NotificationManager
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Run only on the designated debug test device; no deletion/reset of saved channels. */
@RunWith(AndroidJUnit4::class)
class NotificationChannelsTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Test fun repeatedCreationPreservesAndroidPreferences() {
        if (Build.VERSION.SDK_INT < 26) return
        NotificationChannels.ensure(context)
        val manager = context.getSystemService(NotificationManager::class.java)
        val before = manager.getNotificationChannel(NotificationChannels.MESSAGES)
        NotificationChannels.ensure(context)
        val after = manager.getNotificationChannel(NotificationChannels.MESSAGES)
        assertEquals("maddychats-messages", after.id)
        assertEquals(before.importance, after.importance)
        assertEquals(before.sound, after.sound)
        assertEquals(before.shouldVibrate(), after.shouldVibrate())
    }
    @Test fun newMessagesCanAlertWhileQuietUpdatesRemainNonInterrupting() {
        val loud = NotificationChannels.builder(context, false).setSmallIcon(R.drawable.ic_stat_ic_notification).build()
        val quiet = NotificationChannels.builder(context, true).setSmallIcon(R.drawable.ic_stat_ic_notification).build()
        assertEquals(Notification.CATEGORY_MESSAGE, loud.category)
        assertEquals(Notification.VISIBILITY_PRIVATE, loud.visibility)
        assertEquals(Notification.PRIORITY_HIGH, loud.priority)
        assertEquals(0, loud.flags and Notification.FLAG_ONLY_ALERT_ONCE)
        assertEquals(Notification.PRIORITY_LOW, quiet.priority)
        assertTrue(quiet.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0)
        assertNull(quiet.sound)
        assertNull(quiet.vibrate)
        if (Build.VERSION.SDK_INT >= 26) {
            assertEquals(NotificationChannels.MESSAGES, loud.channelId)
            assertEquals(NotificationChannels.QUIET, quiet.channelId)
        }
    }
}
