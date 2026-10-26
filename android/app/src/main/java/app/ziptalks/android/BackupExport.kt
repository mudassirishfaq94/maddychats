package app.ziptalks.android

import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import java.io.File
import java.util.UUID

/** Bounded encrypted backup transfer to a user-selected Android document. */
class BackupExport(private val activity: MainActivity) {
    private data class Transfer(val id: String, val name: String, val file: File, val size: Long, val started: Long)
    private var transfer: Transfer? = null
    private var completed: ((String?) -> Unit)? = null
    private val picker = activity.registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val current = transfer
        val done = completed
        transfer = null; completed = null
        if (current == null) return@registerForActivityResult
        if (uri == null) { current.file.delete(); done?.invoke("Save cancelled."); return@registerForActivityResult }
        Thread {
            val error = runCatching {
                activity.contentResolver.openOutputStream(uri, "w")?.use { output -> current.file.inputStream().use { it.copyTo(output) } }
                    ?: throw IllegalStateException("No output stream")
            }.exceptionOrNull()
            current.file.delete()
            activity.runOnUiThread { done?.invoke(if (error == null) null else "Could not save the backup. Try another folder.") }
        }.start()
    }
    fun start(name: String, size: Long): String {
        if (completed == null && transfer?.let { System.currentTimeMillis() - it.started >= 10 * 60 * 1000L } == true) {
            transfer?.file?.delete(); transfer = null
        }
        check(transfer == null && completed == null) { "Another backup is being saved. Finish or cancel it first." }
        require(size in 1..(128L * 1024 * 1024 + 1024)) { "Backup exceeds the supported archive size." }
        require(Regex("[a-zA-Z0-9._ -]{1,120}\\.circlo").matches(name)) { "Invalid backup filename." }
        val folder = File(activity.cacheDir, "backup-export").apply { mkdirs() }
        folder.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24 * 60 * 60 * 1000L }?.forEach { it.delete() }
        val value = Transfer(UUID.randomUUID().toString(), name, File.createTempFile("backup_", ".tmp", folder), size, System.currentTimeMillis())
        transfer = value
        return value.id
    }
    fun append(id: String, offset: Long, encoded: String) {
        val current = transfer ?: error("Start the backup export again.")
        check(completed == null && current.id == id && System.currentTimeMillis() - current.started < 10 * 60 * 1000) { "Backup transfer expired." }
        require(encoded.length <= 262144 && offset == current.file.length()) { "Backup chunk is invalid or out of order." }
        val bytes = Base64.decode(encoded, Base64.DEFAULT)
        require(bytes.isNotEmpty() && current.file.length() + bytes.size <= current.size) { "Backup chunk exceeds the expected size." }
        current.file.appendBytes(bytes)
    }
    fun finish(id: String, done: (String?) -> Unit) {
        val current = transfer ?: error("Start the backup export again.")
        check(current.id == id && completed == null && current.file.length() == current.size) { "Backup is incomplete." }
        completed = done
        try { picker.launch(current.name) } catch (cause: Exception) { completed = null; cancel(id); throw cause }
    }
    fun cancel(id: String) {
        if (transfer?.id != id || completed != null) return
        transfer?.file?.delete(); transfer = null
    }
    fun close() { transfer?.file?.delete(); transfer = null; completed = null }
}
