package app.ziptalks.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import java.util.Locale

/** In-memory notification monogram. No image fetch, disk cache or contact permission. */
object NativeContactAvatar {
    fun create(name: String): Bitmap {
        val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = Color.rgb(65, 55, 43)
        canvas.drawCircle(48f, 48f, 48f, paint)
        paint.color = Color.rgb(238, 215, 174)
        paint.textSize = 34f
        paint.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        paint.textAlign = Paint.Align.CENTER
        val initials = NativeCallIdentity.name(name, false).split(Regex("\\s+")).take(2)
            .joinToString("") { part -> String(Character.toChars(part.codePointAt(0))) }.uppercase(Locale.ROOT)
        canvas.drawText(initials, 48f, 48f - (paint.ascent() + paint.descent()) / 2, paint)
        return bitmap
    }
}
