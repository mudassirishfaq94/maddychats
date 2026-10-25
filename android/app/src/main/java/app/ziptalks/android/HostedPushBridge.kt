package app.ziptalks.android

import android.Manifest
import android.os.Build
import android.util.Base64
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.io.File

/** Exact HTTPS origin and main-frame restriction, including asynchronous responses. */
class HostedPushBridge(private val activity: MainActivity, private val requestPermission: (() -> Unit) -> Unit) {
    fun install(view: WebView) {
        NativePushState.previewWebView = java.lang.ref.WeakReference(view)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(view, "CircloPush", setOf(BuildConfig.API_BASE_URL)) { source, message, origin, mainFrame, reply ->
            if (!PushPolicy.allowsBridge(mainFrame, origin.toString(), source.url.orEmpty(), BuildConfig.API_BASE_URL)) return@addWebMessageListener
            val raw = runCatching { message.data }.getOrNull() ?: return@addWebMessageListener
            if (raw.length > 28 * 1024 * 1024) return@addWebMessageListener
            val data = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
            val command = data.optString("command")
            if (command == "backup-chunk" && raw.length > 270000) return@addWebMessageListener
            if (command !in setOf("open-file", "backup-chunk") && raw.length > 4096) return@addWebMessageListener
            val id = data.optString("id")
            if (!Regex("[a-zA-Z0-9-]{1,64}").matches(id)) return@addWebMessageListener
            fun respond(token: String? = null, error: String? = null, status: JSONObject? = null, audio: JSONObject? = null) {
                if (!WebOriginPolicy.isAllowed(source.url.orEmpty(), BuildConfig.API_BASE_URL) || activity.isDestroyed) return
                val result = JSONObject().put("id", id)
                status?.let { result.put("status", it) }
                audio?.let { result.put("audio", it) }
                token?.let { result.put("token", it) }; error?.let { result.put("error", it) }
                runCatching { reply.postMessage(result.toString()) }
            }
            fun token() {
                val permitted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                if (!permitted || !NotificationManagerCompat.from(activity).areNotificationsEnabled()) { respond(); return }
                runCatching {
                    FirebaseMessaging.getInstance().token.addOnCompleteListener(activity) { task ->
                        if (task.isSuccessful) respond(task.result) else respond(error = "Notifications unavailable. Please retry later.")
                    }
                }.onFailure { respond(error = "Notifications are not configured for this Android build.") }
            }
            when (data.optString("command")) {
                "backup-start" -> runCatching { val file = data.getJSONObject("file"); activity.backupExport.start(file.getString("name"), file.getLong("size")) }
                    .onSuccess { respond(token = it) }.onFailure { respond(error = it.message ?: "Could not start backup export.") }
                "backup-chunk" -> runCatching { val file = data.getJSONObject("file"); activity.backupExport.append(file.getString("transfer"), file.getLong("offset"), file.getString("data")) }
                    .onSuccess { respond(token = "chunk") }.onFailure { respond(error = "Backup transfer failed. Please retry.") }
                "backup-finish" -> runCatching { activity.backupExport.finish(data.getJSONObject("file").getString("transfer")) { error -> if (error == null) respond(token = "saved") else respond(error = error) } }
                    .onFailure { respond(error = "Could not save this backup. Please retry.") }
                "backup-cancel" -> { activity.backupExport.cancel(data.optJSONObject("file")?.optString("transfer").orEmpty()); respond() }
                "camera-settings" -> runCatching {
                    activity.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:${activity.packageName}")))
                }.onSuccess { respond() }.onFailure { respond(error = "Open Android Settings > Apps > Circlo > Permissions > Camera.") }
                "call-answer" -> {
                    val accepted = NativeCallActions.valid(activity, data.optString("callId"), data.optString("actionToken"), true)
                    android.util.Log.i("CircloCall", "Answer proof consumed=$accepted")
                    respond(token = if (accepted) "active" else "unavailable")
                }
                "call-start" -> respond(token = if (NativeCallSessionService.begin(activity, data)) "active" else "unavailable")
                "call-renew" -> respond(token = if (NativeCallSessionService.renew(activity, data)) "active" else "unavailable")
                "call-audio" -> runCatching { NativeCallSessionService.audio(activity, data) }
                    .onSuccess { if (it == null) respond(error = "Call audio controls are unavailable.") else respond(audio = it) }
                    .onFailure { respond(error = "Could not change audio output. Try again.") }
                "call-stop" -> {
                    val call = NativeCallSessionService.session
                    if (call != null && call.id == data.optString("callId") && call.user == data.optString("userId") && call.client == data.optString("clientId")) NativeCallSessionService.stop(activity)
                    respond()
                }
                "call-settings" -> { NotificationChannels.openCallSettings(activity); respond() }
                "settings" -> { runCatching { NotificationChannels.openSettings(activity) }.onSuccess { respond() }.onFailure { respond(error = "Open Android Settings > Apps > Circlo > Notifications.") } }
                "open-file" -> {
                    val attachment = data.optJSONObject("file")
                    val name = attachment?.optString("name").orEmpty()
                        .replace(Regex("[^a-zA-Z0-9._ -]"), "_").take(120).ifBlank { "attachment" }
                    val mime = attachment?.optString("mime").orEmpty()
                        .takeIf { it.length <= 128 && Regex("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_-]+").matches(it) }
                        ?: "application/octet-stream"
                    val encoded = attachment?.optString("data").orEmpty()
                    if (encoded.isBlank() || encoded.length > 28 * 1024 * 1024) {
                        respond(error = "This file is too large to open in Circlo.")
                        return@addWebMessageListener
                    }
                    Thread {
                        val uriResult = runCatching {
                            val bytes = Base64.decode(encoded, Base64.DEFAULT)
                            if (bytes.isEmpty() || bytes.size > 20 * 1024 * 1024) throw IllegalArgumentException("File exceeds the supported size.")
                            val folder = File(activity.cacheDir, "attachments").apply { mkdirs() }
                            val expiry = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
                            folder.listFiles()?.filter { it.lastModified() < expiry }?.forEach { it.delete() }
                            val output = File.createTempFile("circlo_", "_$name", folder)
                            output.writeBytes(bytes)
                            FileProvider.getUriForFile(activity, "${BuildConfig.APPLICATION_ID}.fileprovider", output)
                        }
                        activity.runOnUiThread {
                            uriResult.onSuccess { uri ->
                                val viewIntent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                viewIntent.clipData = ClipData.newUri(activity.contentResolver, name, uri)
                                runCatching { activity.startActivity(Intent.createChooser(viewIntent, "Open $name")) }
                                    .onSuccess { respond(token = "opened") }
                                    .onFailure { respond(error = "No app on this device can open this file type.") }
                            }.onFailure { respond(error = "Couldn't prepare this file to open. Please try again.") }
                        }
                    }.start()
                }
                "status" -> respond(status = NotificationChannels.status(activity))
                "token" -> token()
                "request" -> requestPermission { token() }
                "privacy" -> {
                    val user = data.optString("userId")
                    val prefs = activity.getSharedPreferences("circlo_push", android.content.Context.MODE_PRIVATE)
                    if (prefs.getString("user", null) == user) {
                        val locks = data.optJSONArray("lockedChats")?.toString() ?: "null"
                        val changed = prefs.getString("locks_$user", "null") != locks
                        prefs.edit().putString("locks_$user", locks).apply()
                        NativePushState.dismiss(activity)
                        if (changed) NativePushState.hideLockedCalls(activity)
                    }
                    respond()
                }
                "dismiss" -> { NativePushState.dismiss(activity); respond() }
                "preview" -> {
                    val notice = data.optJSONObject("notification")
                    if (notice != null) LocalMessageNotification.show(activity, notice)
                    respond()
                }
                "preview-finished" -> respond()
                "clear" -> { NativePushState.clear(activity); respond() }
                "reconcile" -> {
                    val user = data.optString("userId")
                    if (NativeCallPolicy.uuid(user)) { NativePushState.prepareUser(activity, user); respond() }
                    else respond(error = "Invalid account.")
                }
                "bind" -> {
                    val user = data.optString("userId")
                    if (Regex("[a-fA-F0-9-]{36}").matches(user)) { NativePushState.bind(activity, user); NativeSessionCookies.persist(); respond() }
                    else respond(error = "Invalid account.")
                }
                else -> respond(error = "Unsupported notification command.")
            }
        }
    }
}
