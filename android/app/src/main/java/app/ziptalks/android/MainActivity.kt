package app.ziptalks.android

import android.content.Context
import android.content.ContentResolver
import android.content.Intent
import android.content.pm.PackageManager
import android.Manifest
import android.net.Uri
import android.provider.OpenableColumns
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import android.app.Activity
import android.graphics.Color as AndroidColor
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.content.ContextCompat
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.ValueCallback
import android.webkit.PermissionRequest
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

private data class Conversation(val id: String, val title: String, val preview: String)
private data class Message(val id: String, val text: String, val mine: Boolean, val sender: String, val attachmentNames: List<String>, val encrypted: Boolean)

/** Cookie-backed HTTPS client for the existing Next.js API. No WebView is used. */
private class ZipTalkApi(context: Context) {
    private val prefs = context.getSharedPreferences("ziptalk-session", Context.MODE_PRIVATE)
    private val cookies = ConcurrentHashMap<String, String>()
    private val client = OkHttpClient.Builder().cookieJar(object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, received: List<Cookie>) {
            received.forEach { cookies[it.name] = it.toString() }
            prefs.edit().putString("cookies", cookies.values.joinToString("\n")).apply()
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> = cookies.values.mapNotNull { Cookie.parse(url, it) }
    }).build()

    init { prefs.getString("cookies", "")!!.lines().filter { it.isNotBlank() }.forEach { raw ->
        Cookie.parse(BuildConfig.API_BASE_URL.toHttpUrl(), raw)?.let { cookies[it.name] = raw }
    } }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        val builder = Request.Builder().url("${BuildConfig.API_BASE_URL}$path")
            .header("Accept", "application/json").header("User-Agent", "ZipTalk-Android/1.0")
        if (body != null) builder.header("Content-Type", "application/json")
        when (method) { "POST" -> builder.post((body?.toString() ?: "").toRequestBody("application/json".toMediaType()))
            else -> builder.get() }
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val json = JSONObject(if (text.isBlank()) "{}" else text)
            if (!response.isSuccessful) throw IOException(json.optString("error", "Request failed (${response.code})"))
            return json
        }
    }

    fun login(identifier: String, password: String) = request("/api/auth/login", "POST", JSONObject().put("identifier", identifier).put("password", password))
    fun register(name: String, username: String, email: String, password: String) = request("/api/auth/register", "POST", JSONObject()
        .put("displayName", name).put("username", username).put("email", email).put("password", password))
    fun googleClientId(): String = request("/api/auth/google/native").getString("clientId")
    fun loginWithGoogle(idToken: String, policiesAccepted: Boolean) = request("/api/auth/google/native", "POST", JSONObject().put("idToken", idToken).put("acceptTerms", policiesAccepted).put("acceptPrivacy", policiesAccepted))
    fun exchangeGoogleMobileTicket(ticket: String, verifier: String) = request("/api/auth/google/native", "POST", JSONObject().put("ticket", ticket).put("verifier", verifier))
    fun cookiesForWeb(): List<String> = cookies.values.toList()
    fun currentUserId(): String? = runCatching { request("/api/auth/me").getJSONObject("user").getString("id") }.getOrNull()
    fun conversations(): List<Conversation> {
        val list = request("/api/conversations").optJSONArray("conversations") ?: JSONArray()
        return List(list.length()) { i -> list.getJSONObject(i).let { c ->
            val other = c.optJSONObject("otherMember")
            val name = c.opt("name")?.takeIf { it != JSONObject.NULL }?.toString()?.trim().orEmpty()
            val otherName = other?.opt("displayName")?.takeIf { it != JSONObject.NULL }?.toString()?.trim().orEmpty()
            val last = c.optJSONObject("lastMessage")
            val preview = when {
                last == null -> "No messages yet"
                last.optBoolean("encrypted") -> "Encrypted message"
                else -> last.opt("text")?.takeIf { it != JSONObject.NULL }?.toString()?.trim().orEmpty().ifBlank { "Attachment" }
            }
            Conversation(c.getString("id"), name.ifBlank { otherName.ifBlank { "Direct message" } }, preview)
        } }
    }
    fun messages(id: String, currentUserId: String?): List<Message> {
        val list = request("/api/conversations/$id/messages").optJSONArray("messages") ?: JSONArray()
        return List(list.length()) { i -> list.getJSONObject(i).let { m ->
            val attachments = m.optJSONArray("attachments") ?: JSONArray()
            Message(m.getString("id"), m.optString("text"), m.optString("senderId") == currentUserId,
                m.optJSONObject("sender")?.optString("displayName").orEmpty(),
                List(attachments.length()) { index -> attachments.getJSONObject(index).optString("originalName", "Attachment") },
                m.optBoolean("encrypted"))
        } }
    }
    fun send(id: String, text: String) = request("/api/conversations/$id/messages", "POST", JSONObject().put("text", text))
    fun upload(resolver: ContentResolver, conversationId: String, uri: Uri, caption: String) {
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)) else "attachment"
        } ?: "attachment"
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IOException("Could not read attachment")
        if (bytes.size > 3 * 1024 * 1024) throw IOException("Attachments must be smaller than 3 MB.")
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("conversationId", conversationId)
            .addFormDataPart("text", caption)
            .addFormDataPart("files", name, bytes.toRequestBody(mime.toMediaTypeOrNull()))
            .build()
        client.newCall(Request.Builder().url("${BuildConfig.API_BASE_URL}/api/upload/message").post(form).build()).execute().use { response ->
            if (!response.isSuccessful) {
                val error = response.body?.string()?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }
                throw IOException(error?.ifBlank { null } ?: "Upload failed (${response.code})")
            }
        }
    }
    fun listen(onEvent: (JSONObject) -> Unit): EventSource {
        val request = Request.Builder().url("${BuildConfig.API_BASE_URL}/api/realtime/stream").header("Accept", "text/event-stream").build()
        return EventSources.createFactory(client).newEventSource(request, object : EventSourceListener() {
            override fun onEvent(source: EventSource, id: String?, type: String?, data: String) { runCatching { onEvent(JSONObject(data)) } }
        })
    }
}

class MainActivity : ComponentActivity() {
    val backupExport = BackupExport(this)
    private var webView: WebView? = null
    private var hostedContent: FrameLayout? = null
    private var callTransition: android.view.View? = null
    private fun showCallTransition() {
        val content = hostedContent ?: return
        if (callTransition != null) return
        val cover = android.widget.TextView(this).apply {
            text = "circlo\n\nConnecting your call…"
            textSize = 22f
            gravity = android.view.Gravity.CENTER
            setTextColor(AndroidColor.rgb(218, 192, 146))
            setBackgroundColor(AndroidColor.rgb(18, 22, 29))
            isClickable = true
        }
        callTransition = cover
        content.addView(cover, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    private fun hideCallTransition() {
        callTransition?.let { hostedContent?.removeView(it) }
        callTransition = null
    }
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private var pendingCameraPermission: PermissionRequest? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var keyboardVisible = false
    private val api by lazy { ZipTalkApi(this) }
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = pendingFileChooser ?: return@registerForActivityResult
        pendingFileChooser = null
        val uris = if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val clipData = data?.clipData
            when {
                clipData != null -> Array(clipData.itemCount) { index -> clipData.getItemAt(index).uri }
                data?.data != null -> arrayOf(data.data!!)
                else -> emptyArray()
            }
        } else {
            emptyArray()
        }
        callback.onReceiveValue(uris)
    }
    private var notificationPermissionResult: (() -> Unit)? = null
    private val notificationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationPermissionResult?.invoke(); notificationPermissionResult = null
    }
    private fun requestNotifications(done: () -> Unit) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { done(); return }
        if (notificationPermissionResult != null) { done(); return }
        notificationPermissionResult = done
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    override fun onResume() { super.onResume(); NativePushState.foreground = true }
    override fun onPause() { NativePushState.foreground = false; super.onPause() }
    override fun onStop() { NativeSessionCookies.persist(); super.onStop() }

    private val microphonePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val request = pendingWebPermission ?: return@registerForActivityResult
        pendingWebPermission = null
        if (granted && WebOriginPolicy.isAllowed(request.origin.toString(), BuildConfig.API_BASE_URL) && WebOriginPolicy.isAllowed(webView?.url.orEmpty(), BuildConfig.API_BASE_URL)) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        else request.deny()
    }

    private val cameraPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingCameraPermission ?: return@registerForActivityResult
        pendingCameraPermission = null
        if (granted && CameraAccessPolicy.allows(request.origin.toString(), webView?.url.orEmpty(), BuildConfig.API_BASE_URL)) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Applies AppTheme from postSplashScreenTheme. Without this call the
        // activity remains styled as the launch screen on affected devices,
        // producing the extra title bar and unreadable page text.
        installSplashScreen()
        super.onCreate(savedInstanceState)
        createNotificationChannel()
        // Draw edge-to-edge deliberately and apply the exact system-bar
        // insets to a native container. Theme-only fitting is ignored on
        // some Android 15 devices, which put the status bar over Circlo's
        // hosted header.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        // Insets below resize the WebView itself. Never pan the whole chat
        // above the screen when Android opens the keyboard.
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
        window.statusBarColor = AndroidColor.WHITE
        window.navigationBarColor = AndroidColor.WHITE
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptCookie(true)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView?.canGoBack() == true) webView?.goBack() else finish()
            }
        })
        // Load the hosted app immediately. The server already owns the source
        // of truth for authentication: /app redirects an unauthenticated
        // visitor to /login and renders the dashboard for a valid session.
        // Waiting for a separate native /api/auth/me probe before creating the
        // WebView could leave some Android devices on an empty launch surface
        // when that probe or the Compose first frame stalled.
        webView = createHostedWebView()
        val content = FrameLayout(this).apply {
            addView(requireNotNull(webView), FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ))
        }
        hostedContent = content
        if (Uri.parse(notificationDestination(intent).orEmpty()).path == "/app/call") showCallTransition()
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars(),
            )
            // This native inset is reliable across device skins and rotation;
            // the Circlo header therefore cannot appear behind the status bar.
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
            val visible = keyboard.bottom > bars.bottom
            if (visible != keyboardVisible) {
                keyboardVisible = visible
                webView?.let { browser -> if (WebOriginPolicy.isAllowed(browser.url.orEmpty(), BuildConfig.API_BASE_URL)) browser.evaluateJavascript("document.documentElement.dataset.keyboardOpen='$visible'", null) }
            }
            insets
        }
        setContentView(content)
    }

    // Firebase background notifications deliver data extras to the launcher;
    // foreground notifications use notification_url; app links use intent.data.
    private fun notificationDestination(source: Intent?): String? {
        val raw = source?.getStringExtra("notification_url")
            ?: source?.getStringExtra("url") ?: source?.dataString ?: return null
        PublicAppLink.destination(raw, BuildConfig.API_BASE_URL)?.let { return it }
        val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return null
        val base = Uri.parse(BuildConfig.API_BASE_URL)
        val id = when {
            uri.scheme == "ziptalks" && uri.host == "chat" -> uri.pathSegments.firstOrNull()
            uri.scheme == "https" && (uri.host == base.host || uri.host == "circlo.chat") && uri.port == base.port && uri.userInfo == null &&
                uri.pathSegments.size == 3 && uri.pathSegments.take(2) == listOf("app", "chats") -> uri.lastPathSegment
            else -> null
        } ?: return null
        val uuid = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        if (!uuid.matches(id)) return null
        val call = uri.getQueryParameter("call")?.takeIf { uuid.matches(it) }
        val message = uri.getQueryParameter("message")?.takeIf { uuid.matches(it) }
        val actionToken = source?.getStringExtra("callActionToken")
        val action = if (call != null && uri.getQueryParameter("callAction") == "answer" && NativeCallActions.valid(this, call, actionToken)) "&callAction=answer&callActionToken=$actionToken" else ""
        if (call != null) {
            if (uri.getQueryParameter("callAction") == "answer") android.util.Log.i("CircloCall", "Answer handoff proof valid=${action.isNotEmpty()}")
            return "${BuildConfig.API_BASE_URL}/app/call?call=$call$action"
        }
        return "${BuildConfig.API_BASE_URL}/app/chats/$id?" + (message?.let { "message=$it" } ?: "latest=1")
    }

    private var navigationGeneration = 0

    private fun navigateHosted(destination: String) {
        val browser = webView ?: return
        val generation = ++navigationGeneration
        if (!WebOriginPolicy.isAllowed(browser.url.orEmpty(), BuildConfig.API_BASE_URL)) {
            browser.loadUrl(destination)
            return
        }
        val script = "typeof window.__circloNavigate === 'function' && window.__circloNavigate(${JSONObject.quote(destination)})"
        browser.evaluateJavascript(script) { handled ->
            if (generation == navigationGeneration && webView === browser && handled != "true") browser.loadUrl(destination)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationDestination(intent)?.let { destination ->
            val active = NativeCallSessionService.session
            if (active != null && Uri.parse(destination).getQueryParameter("call") == active.id && WebOriginPolicy.isAllowed(webView?.url.orEmpty(), BuildConfig.API_BASE_URL)) {
                // Returning from the ongoing-call notification must preserve WebRTC.
                webView?.evaluateJavascript("window.dispatchEvent(new Event('circlo:native-call-open'))", null)
            } else {
                if (Uri.parse(destination).path == "/app/call") showCallTransition()
                navigateHosted(destination)
            }
        }
    }

    private fun createNotificationChannel() { NotificationChannels.ensure(this) }

    override fun onDestroy() { backupExport.close(); NativeCallSessionService.stop(this); webView?.destroy(); webView = null; super.onDestroy() }

    fun hostedWebChromeClient() = object : WebChromeClient() {
        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            runOnUiThread { if (pendingWebPermission === request) pendingWebPermission = null; if (pendingCameraPermission === request) pendingCameraPermission = null }
        }
        override fun onPermissionRequest(request: PermissionRequest) {
            // getUserMedia() needs both Android's runtime approval and a
            // WebView resource grant. Camera is limited to contact scanning;
            // audio keeps its separate runtime approval. Unknown resources fail closed.
            runOnUiThread {
                if (request.resources.size == 1 && request.resources[0] == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                    if (!CameraAccessPolicy.allows(request.origin.toString(), webView?.url.orEmpty(), BuildConfig.API_BASE_URL)) { request.deny(); return@runOnUiThread }
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    else { pendingCameraPermission?.deny(); pendingCameraPermission = request; cameraPermissionLauncher.launch(Manifest.permission.CAMERA) }
                    return@runOnUiThread
                }
                if (!WebOriginPolicy.isAllowed(request.origin.toString(), BuildConfig.API_BASE_URL) || !WebOriginPolicy.isAllowed(webView?.url.orEmpty(), BuildConfig.API_BASE_URL) || (request.resources.size != 1 || !request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE))) {
                    request.deny()
                    return@runOnUiThread
                }
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.RECORD_AUDIO,
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    return@runOnUiThread
                }
                pendingWebPermission?.deny()
                pendingWebPermission = request
                microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }

        override fun onShowFileChooser(
            view: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            // WebView does not open <input type="file"> itself. Route the
            // request to Android's system document picker and pass selected
            // content URIs back to Circlo's existing upload component.
            pendingFileChooser?.onReceiveValue(emptyArray())
            pendingFileChooser = filePathCallback
            return try {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    putExtra(Intent.EXTRA_MIME_TYPES, fileChooserParams.acceptTypes.filter { it.isNotBlank() }.toTypedArray())
                }
                fileChooserLauncher.launch(intent)
                true
            } catch (_: Exception) {
                pendingFileChooser = null
                filePathCallback.onReceiveValue(emptyArray())
                false
            }
        }
    }

    /**
     * Creates the hosted app WebView and starts loading the intent destination
     * or the chat list, with native bridge, permission and navigation handlers.
     * Imports and flushes legacy cookies only when neither session cookie has a
     * nonblank value and legacy cookies are available. Setup and migration
     * failures propagate to the caller.
     */
    private fun createHostedWebView(): WebView = WebView(this).apply {
        setBackgroundColor(AndroidColor.WHITE)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        @Suppress("DEPRECATION")
        settings.databaseEnabled = true
        // Use LOAD_DEFAULT to enable caching for faster app startup.
        // Hashed web assets are versioned by the server; preserve them across launches.
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = false
        settings.loadWithOverviewMode = false
        settings.useWideViewPort = false
        settings.userAgentString = "${settings.userAgentString} ZipTalkAndroid/0.8"
        // HTTP freshness controls updates. Never clear reusable resources on launch.
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(this, false)
        // Migrate legacy native sessions only when WebView has no session.
        // Never overwrite the current WebView login with an older saved cookie.
        val migrated = WebSessionCookieMigration.cookiesToImport(cookieManager.getCookie(BuildConfig.API_BASE_URL)) { api.cookiesForWeb() }
        if (migrated.isNotEmpty()) {
            migrated.forEach { cookieManager.setCookie(BuildConfig.API_BASE_URL, it) }
            cookieManager.flush()
        }
        HostedPushBridge(this@MainActivity) { done -> requestNotifications(done) }.install(this)
        webChromeClient = hostedWebChromeClient()
        webViewClient = hostedWebClient()
        loadUrl(notificationDestination(intent) ?: "${BuildConfig.API_BASE_URL}/app/chats")
    }

    private fun showOfflineShell(view: WebView) {
        hideCallTransition()
        // A real same-origin navigation preserves storage, module/CSP semantics
        // and reload behavior. The strict public asset handler works offline.
        view.loadUrl("${BuildConfig.API_BASE_URL}/offline.html")
    }

    fun hostedWebClient() = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: android.webkit.WebResourceRequest): android.webkit.WebResourceResponse? {
                val asset = OfflineShellAssets.assetPath(request.url.toString(), BuildConfig.API_BASE_URL, request.method)
                if (asset != null) {
                    return android.webkit.WebResourceResponse(OfflineShellAssets.mimeType(asset), "UTF-8", assets.open(asset))
                }
                return super.shouldInterceptRequest(view, request)
            }
            override fun onReceivedHttpError(view: WebView, request: android.webkit.WebResourceRequest, response: android.webkit.WebResourceResponse) {
                super.onReceivedHttpError(view, request, response)
                if (request.isForMainFrame && response.statusCode >= 500 && WebOriginPolicy.isAllowed(request.url.toString(), BuildConfig.API_BASE_URL)) showOfflineShell(view)
            }
            override fun onReceivedError(view: WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    hideCallTransition()
                    if (WebOriginPolicy.isAllowed(request.url.toString(), BuildConfig.API_BASE_URL) && error.errorCode in setOf(ERROR_HOST_LOOKUP, ERROR_CONNECT, ERROR_TIMEOUT)) showOfflineShell(view)
                }
            }
            override fun onPageCommitVisible(view: WebView, url: String) {
                super.onPageCommitVisible(view, url)
                if (WebOriginPolicy.isAllowed(url, BuildConfig.API_BASE_URL)) hideCallTransition()
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (WebOriginPolicy.isAllowed(url, BuildConfig.API_BASE_URL)) {
                    NativeSessionCookies.persist()
                    view.evaluateJavascript("document.documentElement.dataset.keyboardOpen='$keyboardVisible'", null)
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return !WebOriginPolicy.allowsFrame(request.url.toString(), BuildConfig.API_BASE_URL)
                return shouldOverrideUrlLoading(view, request.url.toString())
            }
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (WebOriginPolicy.isAllowed(url, BuildConfig.API_BASE_URL) && Uri.parse(url).path == "/api/auth/google") {
                    val entry = Uri.parse(url)
                    val accepted = entry.getQueryParameter("terms") == "1" && entry.getQueryParameter("privacy") == "1" && entry.getQueryParameter("mode") != "link"
                    val next = entry.getQueryParameter("next")?.takeIf { it.startsWith("/") && !it.startsWith("//") && !it.contains("\\") && !it.contains("\r") && !it.contains("\n") } ?: "/app"
                    val activity = this@MainActivity
                    CoroutineScope(Dispatchers.Main).launch {
                        runCatching { nativeGoogleSignIn(activity, api, accepted) }
                            .onSuccess { result ->
                                val cookieManager = CookieManager.getInstance()
                                api.cookiesForWeb().forEach { cookieManager.setCookie(BuildConfig.API_BASE_URL, it) }
                                cookieManager.flush()
                                view.loadUrl(if (result.optBoolean("mfaRequired")) "${BuildConfig.API_BASE_URL}/login?mfa=1&next=${Uri.encode(next)}" else notificationDestination(intent) ?: "${BuildConfig.API_BASE_URL}$next")
                            }
                            .onFailure { view.loadUrl("${BuildConfig.API_BASE_URL}/login?error=google_native_failed") }
                    }
                    return true
                }
                if (WebOriginPolicy.isAllowed(url, BuildConfig.API_BASE_URL)) return false
                val external = Uri.parse(url)
                if (external.scheme in listOf("https", "mailto", "tel")) runCatching { startActivity(Intent(Intent.ACTION_VIEW, external)) }
                return true
            }
        }
}

private suspend fun nativeGoogleSignIn(activity: Activity, api: ZipTalkApi, policiesAccepted: Boolean = false): JSONObject {
    if (!policiesAccepted) throw IOException("Agree to both policies on the sign-in page. Link Google accounts in a browser.")
    val clientId = withContext(Dispatchers.IO) { api.googleClientId() }
    // Fresh requests must not reuse an otherwise identical cached ID token;
    // the server consumes each signed native credential once.
    val googleOption = GetSignInWithGoogleOption.Builder(clientId)
        .setNonce(java.util.UUID.randomUUID().toString()).build()
    val result = try {
        CredentialManager.create(activity).getCredential(
            activity,
            GetCredentialRequest.Builder().addCredentialOption(googleOption).build(),
        )
    } catch (_: NoCredentialException) {
        throw IOException("No Google account is available. Add an account on this phone or use your Circlo password.")
    }
    val credential = result.credential
    if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        throw IOException("Google sign-in did not return an ID token.")
    }
    val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
    return withContext(Dispatchers.IO) { api.loginWithGoogle(token, policiesAccepted) }
}

private fun authErrorMessage(error: Throwable): String {
    val raw = error.message.orEmpty()
    return if (raw.contains("[16]") || raw.contains("reauth", ignoreCase = true)) {
        "Google sign-in needs this Circlo Android app to be approved in Google Cloud. Add the Circlo package and signing certificate, then try again."
    } else raw.ifBlank { "Sign-in could not be completed. Please try again." }
}

