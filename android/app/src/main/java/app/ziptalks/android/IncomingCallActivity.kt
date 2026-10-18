package app.ziptalks.android

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Lock-screen presentation only. No microphone, keys, or WebView starts before Answer. */
class IncomingCallActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var call: String
    private lateinit var recipient: String
    private lateinit var url: String
    private var expires: Long = 0
    private val check = object : Runnable {
        override fun run() {
            if (!live()) { finish(); return }
            handler.postDelayed(this, 500)
        }
    }
    private fun live(): Boolean = NativeCallPolicy.valid(getSharedPreferences("circlo_push", MODE_PRIVATE).getString("user", null), recipient, call, url, expires, System.currentTimeMillis()) && !NativePushState.callClosed(this, call)
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        call = intent.getStringExtra("callId").orEmpty()
        recipient = intent.getStringExtra("recipientId").orEmpty()
        url = intent.getStringExtra("callUrl").orEmpty()
        expires = intent.getLongExtra("expiresAt", 0)
        if (!live()) { finish(); return }
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(40, 60, 40, 60)
            setBackgroundColor(android.graphics.Color.rgb(21, 23, 25))
        }
        layout.addView(TextView(this).apply { text = "Incoming Circlo call"; textSize = 26f; setTextColor(android.graphics.Color.WHITE); gravity = Gravity.CENTER })
        layout.addView(TextView(this).apply { text = "Answer to open Circlo and connect securely."; textSize = 16f; setTextColor(android.graphics.Color.LTGRAY); setPadding(0, 30, 0, 45) })
        layout.addView(Button(this).apply { text = "Answer"; setOnClickListener {
            if (!live()) { finish(); return@setOnClickListener }
            NativeIncomingCall.dismiss(this@IncomingCallActivity, call)
            val open = Intent(this@IncomingCallActivity, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("notification_url", "$url&callAction=answer")
                putExtra("callActionToken", NativeCallActions.issue(this@IncomingCallActivity, call, expires))
            }
            startActivity(open)
            if (Build.VERSION.SDK_INT >= 26) getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this@IncomingCallActivity, null)
            finish()
        } })
        layout.addView(Button(this).apply { text = "Decline"; setOnClickListener {
            sendBroadcast(Intent(this@IncomingCallActivity, NativeCallDeclineReceiver::class.java).putExtra("callId", call).putExtra("recipientId", recipient))
            finish()
        } })
        setContentView(layout)
        handler.post(check)
    }
    override fun onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy() }
}
