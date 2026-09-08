package app.ziptalks.android

import android.content.Context
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import android.os.Bundle
import android.app.Activity
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
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
    fun loginWithGoogle(idToken: String) = request("/api/auth/google/native", "POST", JSONObject().put("idToken", idToken))
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
    private var webView: WebView? = null
    private val api by lazy { ZipTalkApi(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CookieManager.getInstance().setAcceptCookie(true)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView?.canGoBack() == true) webView?.goBack() else finish()
            }
        })
        setContent { ZipTalkHostedExperience(api) { webView = it } }
    }

    override fun onDestroy() { webView?.destroy(); webView = null; super.onDestroy() }
}

/**
 * The production Android experience deliberately renders the existing ZipTalk
 * application in an app-owned WebView. This is a standalone Android window
 * (not Chrome, a Custom Tab, or a PWA), while preserving exact web parity and
 * the proven browser E2EE implementation during the native migration.
 */
@Composable private fun ZipTalkHostedExperience(api: ZipTalkApi, onReady: (WebView) -> Unit) {
    var startUrl by remember { mutableStateOf<String?>(null) }

    // A cookie saved by the retired Compose client can be expired or belong to
    // an earlier deployment. Do not render an authenticated route until the
    // server has accepted it; doing so left the WebView showing an empty shell.
    LaunchedEffect(Unit) {
        val hasValidSession = withContext(Dispatchers.IO) { api.currentUserId() != null }
        startUrl = if (hasValidSession) {
            "${BuildConfig.API_BASE_URL}/app"
        } else {
            "${BuildConfig.API_BASE_URL}/login?next=%2Fapp"
        }
    }

    if (startUrl == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(color = Color(0xFFAAA6FF)) }
        return
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.databaseEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.loadWithOverviewMode = false
                settings.useWideViewPort = false
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                // Older native builds saved the login cookie in OkHttp. Move it
                // into WebView before the first server-rendered page request so
                // the hosted UI receives the same signed-in session and data.
                val cookieManager = CookieManager.getInstance()
                api.cookiesForWeb().forEach { cookieManager.setCookie(BuildConfig.API_BASE_URL, it) }
                cookieManager.flush()
                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                        // Google does not permit OAuth inside embedded browsers.
                        // Use Android Credential Manager and return its session to
                        // this app-owned web window instead.
                        if (url.startsWith("${BuildConfig.API_BASE_URL}/api/auth/google")) {
                            val activity = context as? Activity ?: return false
                            CoroutineScope(Dispatchers.Main).launch {
                                runCatching { nativeGoogleSignIn(activity, api) }
                                    .onSuccess {
                                        val manager = CookieManager.getInstance()
                                        api.cookiesForWeb().forEach { manager.setCookie(BuildConfig.API_BASE_URL, it) }
                                        manager.flush()
                                        view.loadUrl(BuildConfig.API_BASE_URL)
                                    }
                                    .onFailure { view.loadUrl("${BuildConfig.API_BASE_URL}/login?error=google_native_failed") }
                            }
                            return true
                        }
                        return false
                    }
                }
                loadUrl(startUrl!!)
                onReady(this)
            }
        },
    )
}

private suspend fun nativeGoogleSignIn(activity: Activity, api: ZipTalkApi) {
    val clientId = withContext(Dispatchers.IO) { api.googleClientId() }
    val googleOption = GetSignInWithGoogleOption.Builder(clientId).build()
    val result = CredentialManager.create(activity).getCredential(
        activity,
        GetCredentialRequest.Builder().addCredentialOption(googleOption).build(),
    )
    val credential = result.credential
    if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        throw IOException("Google sign-in did not return an ID token.")
    }
    val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
    withContext(Dispatchers.IO) { api.loginWithGoogle(token) }
}

private fun authErrorMessage(error: Throwable): String {
    val raw = error.message.orEmpty()
    return if (raw.contains("[16]") || raw.contains("reauth", ignoreCase = true)) {
        "Google sign-in needs this Android app to be approved in Google Cloud. Add the ZipTalk package and signing certificate, then try again."
    } else raw.ifBlank { "Sign-in could not be completed. Please try again." }
}

@Composable private fun ZipTalkNativeApp(api: ZipTalkApi) {
    val scope = rememberCoroutineScope(); var signedIn by remember { mutableStateOf(false) }; var restoring by remember { mutableStateOf(true) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { signedIn = withContext(Dispatchers.IO) { api.currentUserId() != null }; restoring = false }
    val colors = darkColorScheme(
        primary = Color(0xFFA9A7FF), onPrimary = Color(0xFF202743),
        secondary = Color(0xFFC1C0FF), onSecondary = Color(0xFF24284D),
        background = Color(0xFF182033), onBackground = Color(0xFFF4F5FF),
        surface = Color(0xFF222C42), onSurface = Color(0xFFF4F5FF),
        surfaceVariant = Color(0xFF2B3650), onSurfaceVariant = Color(0xFFBFC8E3),
        outline = Color(0xFF64718F), error = Color(0xFFFF858D), onError = Color(0xFF4A111A),
    )
    MaterialTheme(colorScheme = colors) {
        if (restoring) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (!signedIn) {
            val activity = LocalContext.current as? Activity
            LoginScreen(error,
                signIn = { email, password -> scope.launch { runCatching { withContext(Dispatchers.IO) { api.login(email, password) } }.onSuccess { signedIn = true }.onFailure { error = authErrorMessage(it) } } },
                signUp = { name, username, email, password -> scope.launch { runCatching { withContext(Dispatchers.IO) { api.register(name, username, email, password) } }.onSuccess { signedIn = true }.onFailure { error = authErrorMessage(it) } } },
                googleSignIn = { if (activity != null) scope.launch { runCatching { nativeGoogleSignIn(activity, api) }.onSuccess { signedIn = true }.onFailure { error = authErrorMessage(it) } } },
            )
        }
        else ConversationScreen(api)
    }
}

@Composable private fun LoginScreen(error: String?, signIn: (String, String) -> Unit, signUp: (String, String, String, String) -> Unit, googleSignIn: () -> Unit) {
    var creating by remember { mutableStateOf(false) }; var name by remember { mutableStateOf("") }; var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }; var submitting by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), verticalArrangement = Arrangement.Center) {
        Surface(color = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f), shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp)) { Text("ZipTalk", modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.secondary) }
        Spacer(Modifier.height(20.dp)); Text(if (creating) "Create your account" else "Welcome back", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp)); Text(if (creating) "Start chatting securely with the people you know." else "Your conversations are waiting for you.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        if (creating) {
            OutlinedTextField(name, { name = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth()); Spacer(Modifier.height(10.dp))
            OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth()); Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(email, { email = it }, label = { Text(if (creating) "Email address" else "Email or username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp)); OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        error?.let { Spacer(Modifier.height(12.dp)); Text(it, color = MaterialTheme.colorScheme.error) }; Spacer(Modifier.height(18.dp))
        Button({ submitting = true; if (creating) signUp(name.trim(), username.trim(), email.trim(), password) else signIn(email.trim(), password); submitting = false }, Modifier.fillMaxWidth().height(54.dp), enabled = !submitting && email.isNotBlank() && password.isNotBlank() && (!creating || (name.isNotBlank() && username.isNotBlank()))) { Text(if (creating) "Create account" else "Sign in", fontWeight = FontWeight.Bold) }
        Spacer(Modifier.height(14.dp)); Text("or", modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Spacer(Modifier.height(12.dp)); OutlinedButton(googleSignIn, Modifier.fillMaxWidth().height(54.dp)) { Text("G", fontWeight = FontWeight.Bold); Spacer(Modifier.width(10.dp)); Text("Continue with Google") }
        Spacer(Modifier.height(14.dp)); TextButton({ creating = !creating; submitting = false }, Modifier.align(Alignment.CenterHorizontally)) { Text(if (creating) "Already have an account? Sign in" else "New to ZipTalk? Create an account") }
    }
}

@Composable private fun ConversationScreen(api: ZipTalkApi) {
    var conversations by remember { mutableStateOf<List<Conversation>>(emptyList()) }; var selected by remember { mutableStateOf<Conversation?>(null) }; var loading by remember { mutableStateOf(true) }; var loadError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { runCatching { withContext(Dispatchers.IO) { api.conversations() } }.onSuccess { conversations = it }.onFailure { loadError = it.message }.also { loading = false } }
    if (selected == null) Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(20.dp)); Text("ZipTalk", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary); Spacer(Modifier.height(20.dp)); Text("Chats", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        when { loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            loadError != null -> Text(loadError ?: "Could not load chats", color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 24.dp))
            conversations.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("No conversations yet", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            else -> LazyColumn(Modifier.fillMaxSize().padding(top = 12.dp)) { items(conversations) { c -> Row(Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).clickable { selected = c }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(48.dp).clip(androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) { Surface(color = MaterialTheme.colorScheme.primary) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(c.title.take(1).uppercase(), fontWeight = FontWeight.Bold) } } }; Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(c.title, fontWeight = FontWeight.SemiBold); Text(c.preview, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant) } } } }
        }
    }
    else ChatScreen(selected!!, api) { selected = null }
}

@Composable private fun ChatScreen(conversation: Conversation, api: ZipTalkApi, back: () -> Unit) {
    val scope = rememberCoroutineScope(); val resolver = LocalContext.current.contentResolver; var messages by remember { mutableStateOf<List<Message>>(emptyList()) }; var draft by remember { mutableStateOf("") }; var me by remember { mutableStateOf<String?>(null) }; var attachment by remember { mutableStateOf<Uri?>(null) }; var uploadError by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> attachment = uri }
    suspend fun refresh() { messages = withContext(Dispatchers.IO) { api.messages(conversation.id, me) } }
    LaunchedEffect(conversation.id) { me = withContext(Dispatchers.IO) { api.currentUserId() }; refresh() }
    DisposableEffect(conversation.id) {
        val stream = api.listen { event -> if (event.optString("conversationId") == conversation.id && event.optString("type").startsWith("message:")) scope.launch { refresh() } }
        onDispose { stream.cancel() }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) { TextButton(back) { Text("‹ ${conversation.title}") }; LazyColumn(Modifier.weight(1f)) { items(messages) { message -> Column(Modifier.padding(vertical = 8.dp)) { Text(if (message.mine) "You" else message.sender, style = MaterialTheme.typography.labelSmall); if (message.encrypted) Text("Encrypted message — native key support is being added", color = MaterialTheme.colorScheme.secondary) else if (message.text.isNotBlank()) Text(message.text); message.attachmentNames.forEach { Text("📎 $it", color = MaterialTheme.colorScheme.primary) } } } }; attachment?.let { Text("Attachment selected", color = MaterialTheme.colorScheme.primary) }; uploadError?.let { Text(it, color = MaterialTheme.colorScheme.error) }; Row { Button({ picker.launch(arrayOf("*/*")) }) { Text("Attach") }; OutlinedTextField(draft, { draft = it }, Modifier.weight(1f), label = { Text("Message") }); Button({ val text = draft.trim(); if (text.isNotEmpty() || attachment != null) scope.launch { runCatching { withContext(Dispatchers.IO) { attachment?.let { api.upload(resolver, conversation.id, it, text) } ?: api.send(conversation.id, text) } }.onSuccess { refresh(); draft = ""; attachment = null; uploadError = null }.onFailure { uploadError = it.message } } }) { Text("Send") } } }
}
