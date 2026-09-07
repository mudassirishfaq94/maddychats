package app.ziptalks.android

import android.content.Context
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import android.os.Bundle
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
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
    fun currentUserId(): String? = runCatching { request("/api/auth/me").getJSONObject("user").getString("id") }.getOrNull()
    fun conversations(): List<Conversation> {
        val list = request("/api/conversations").optJSONArray("conversations") ?: JSONArray()
        return List(list.length()) { i -> list.getJSONObject(i).let { c ->
            val other = c.optJSONObject("otherMember")
            Conversation(c.getString("id"), c.optString("name").ifBlank { other?.optString("displayName").orEmpty().ifBlank { "Conversation" } }, c.optJSONObject("lastMessage")?.optString("text").orEmpty())
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
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { ZipTalkNativeApp(ZipTalkApi(this)) } }
}

@Composable private fun ZipTalkNativeApp(api: ZipTalkApi) {
    val scope = rememberCoroutineScope(); var signedIn by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { signedIn = withContext(Dispatchers.IO) { api.currentUserId() != null } }
    MaterialTheme(colorScheme = darkColorScheme(primary = MaterialTheme.colorScheme.primary)) {
        if (!signedIn) LoginScreen(error) { email, password -> scope.launch { runCatching { withContext(Dispatchers.IO) { api.login(email, password) } }.onSuccess { signedIn = true }.onFailure { error = it.message } } }
        else ConversationScreen(api)
    }
}

@Composable private fun LoginScreen(error: String?, signIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text("ZipTalk", style = MaterialTheme.typography.displaySmall); Spacer(Modifier.height(24.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email or username") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }; Spacer(Modifier.height(16.dp))
        Button({ signIn(email, password) }, Modifier.fillMaxWidth()) { Text("Sign in") }
    }
}

@Composable private fun ConversationScreen(api: ZipTalkApi) {
    val scope = rememberCoroutineScope(); var conversations by remember { mutableStateOf<List<Conversation>>(emptyList()) }; var selected by remember { mutableStateOf<Conversation?>(null) }
    LaunchedEffect(Unit) { conversations = withContext(Dispatchers.IO) { api.conversations() } }
    if (selected == null) LazyColumn(Modifier.fillMaxSize().padding(16.dp)) { item { Text("Chats", style = MaterialTheme.typography.headlineMedium) }; items(conversations) { c -> ListItem({ Text(c.title) }, supportingContent = { Text(c.preview) }, modifier = Modifier.clickable { selected = c }) } }
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
