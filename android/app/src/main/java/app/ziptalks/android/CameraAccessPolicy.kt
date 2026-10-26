package app.ziptalks.android

import java.net.URI

/** Only the first-party QR screens may request the WebView camera resource. */
object CameraAccessPolicy {
    fun allows(origin: String, page: String, base: String): Boolean =
        WebOriginPolicy.isAllowed(origin, base) && WebOriginPolicy.isAllowed(page, base) &&
            runCatching { URI(page).path in setOf("/app/people", "/app/profile") }.getOrDefault(false)
}
