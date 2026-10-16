package app.ziptalks.android

import android.app.Application

/** Also runs before Firebase handles a cold-process background message. No permission prompt. */
class CircloApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationChannels.ensure(this)
    }
}
