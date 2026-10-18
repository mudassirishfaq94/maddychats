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
import android.widget.ImageView
import android.widget.FrameLayout
import android.widget.ScrollView
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable

/** Lock-screen presentation only. No microphone, keys, or WebView starts before Answer. */
class IncomingCallActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var call: String
    private lateinit var recipient: String
    private lateinit var url: String
    private var expires: Long = 0
    private var answerRequested = false
    private var launching = false
    private lateinit var answerButton: Button
    private lateinit var instructions: TextView
    private fun locked() = getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true
    private fun openAnsweredCall() {
        if (isFinishing || isDestroyed || launching || !answerRequested || locked() || !live()) return
        launching = true
        val open = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("notification_url", "$url&callAction=answer")
            putExtra("callActionToken", NativeCallActions.issue(this@IncomingCallActivity, call, expires))
        }
        // Keep this visible activity alive until keyguard dismissal completes.
        // Starting a WebView behind keyguard cannot safely acquire its microphone.
        startActivity(open)
        NativeIncomingCall.dismiss(this, call)
        finish()
    }
    private fun answer() {
        if (answerRequested || !live()) return
        answerRequested = true
        answerButton.isEnabled = false
        if (!locked()) { openAnsweredCall(); return }
        instructions.text = "Unlock your phone to connect the call."
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() { openAnsweredCall() }
                override fun onDismissCancelled() { retryAnswer() }
                override fun onDismissError() { retryAnswer() }
            })
        }
        // API 24–25 can still continue after the user unlocks normally.
    }
    private fun retryAnswer() {
        if (isFinishing || isDestroyed || launching) return
        answerRequested = false
        answerButton.isEnabled = true
        instructions.text = "Unlock your phone, then tap Answer to connect."
    }
    private val check = object : Runnable {
        override fun run() {
            if (!live()) { finish(); return }
            if (answerRequested && !locked()) openAnsweredCall()
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
        fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
        val gold = Color.rgb(218, 192, 146)
        window.statusBarColor = Color.rgb(18, 22, 29)
        window.navigationBarColor = Color.rgb(18, 22, 29)
        val backdrop = FrameLayout(this).apply { background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.rgb(18,22,29), Color.rgb(39,36,48), Color.rgb(18,22,29))) }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(36), dp(24), dp(36))
        }
        layout.addView(ImageView(this).apply { setImageResource(R.mipmap.ic_launcher); contentDescription = "Circlo" }, LinearLayout.LayoutParams(dp(88), dp(88)).apply { bottomMargin = dp(20) })
        layout.addView(TextView(this).apply { text = "circlo"; textSize = 22f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(gold); gravity = Gravity.CENTER })
        layout.addView(TextView(this).apply { text = "Incoming audio call"; textSize = 28f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(0, dp(36), 0, dp(12)) })
        instructions = TextView(this).apply { text = "A private conversation is calling.\nAnswer to connect securely."; textSize = 15f; setTextColor(Color.rgb(179,181,193)); gravity = Gravity.CENTER; setPadding(0, 0, 0, dp(36)) }
        layout.addView(instructions)
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun styleAction(button: Button, color: Int) { button.isAllCaps = false; button.textSize = 16f; button.setTextColor(Color.WHITE); button.background = GradientDrawable().apply { setColor(color); cornerRadius = dp(28).toFloat() }; button.minimumHeight = dp(64) }
        val declineButton = Button(this).apply { text = "Decline"; setOnClickListener {
            sendBroadcast(Intent(this@IncomingCallActivity, NativeCallDeclineReceiver::class.java).putExtra("callId", call).putExtra("recipientId", recipient))
            finish()
        } }
        styleAction(declineButton, Color.rgb(143, 48, 61))
        answerButton = Button(this).apply { text = "Answer"; setOnClickListener { answer() } }
        styleAction(answerButton, Color.rgb(37, 117, 91))
        actions.addView(declineButton, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginEnd = dp(8) })
        actions.addView(answerButton, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginStart = dp(8) })
        layout.addView(actions, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        layout.addView(TextView(this).apply { text = "Your circle. Your secrets. Sealed."; textSize = 12f; setTextColor(gold); gravity = Gravity.CENTER; setPadding(0, dp(36), 0, 0) })
        val scroller = ScrollView(this).apply { isFillViewport = true; addView(layout) }
        backdrop.addView(scroller, FrameLayout.LayoutParams(minOf(resources.displayMetrics.widthPixels, dp(420)), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        setContentView(backdrop)
        handler.post(check)
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Only the immutable notification's Answer action requests this;
        // merely presenting the full-screen incoming alert is not consent.
        if (hasFocus && ::answerButton.isInitialized) consumeNotificationAnswer()
    }
    private fun consumeNotificationAnswer() {
        if (!intent.getBooleanExtra("answerRequested", false)) return
        intent.removeExtra("answerRequested")
        answer()
    }
    override fun onNewIntent(source: Intent) {
        super.onNewIntent(source)
        if (source.getStringExtra("callId") != call || source.getStringExtra("recipientId") != recipient || !live()) return
        setIntent(source)
        if (hasWindowFocus()) consumeNotificationAnswer()
    }
    override fun onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy() }
}
