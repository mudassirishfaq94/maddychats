package app.ziptalks.android

import android.content.Context

/** One-time proof that Answer originated in our immutable notification/private activity. */
object NativeCallActions {
    fun issue(context: Context, call: String, expires: Long): String {
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        val token = java.util.UUID.randomUUID().toString()
        prefs.edit().putString("answer_token", token).putString("answer_call", call)
            .putString("answer_user", prefs.getString("user", null)).putLong("answer_expires", expires).apply()
        return token
    }
    @Synchronized fun valid(context: Context, call: String, token: String?, consume: Boolean = false): Boolean {
        if (!NativeCallPolicy.uuid(token)) return false
        val prefs = context.getSharedPreferences("circlo_push", Context.MODE_PRIVATE)
        val user = prefs.getString("user", null) ?: return false
        val now = System.currentTimeMillis()
        val expires = prefs.getLong("answer_expires", 0)
        if (!NativeCallPolicy.validAction(user, prefs.getString("answer_user", null), call, prefs.getString("answer_call", null), token, prefs.getString("answer_token", null), expires, now)) return false
        if (consume) prefs.edit().remove("answer_token").remove("answer_call").remove("answer_user").remove("answer_expires").apply()
        return true
    }
}
