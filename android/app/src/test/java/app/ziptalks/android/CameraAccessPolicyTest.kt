package app.ziptalks.android

import org.junit.Assert.*
import org.junit.Test

class CameraAccessPolicyTest {
    private val base = "https://circlo.chat"
    @Test fun allowsOnlyFirstPartyQrScreens() {
        assertTrue(CameraAccessPolicy.allows(base, "$base/app/profile?recovery=1#encryption-devices", base))
        assertTrue(CameraAccessPolicy.allows(base, "$base/app/people", base))
        for (page in listOf("$base/app/chats", "https://evil.test/app/profile", "$base.evil.test/app/profile", "http://circlo.chat/app/profile", "", "$base/app/profile/other")) {
            assertFalse(page, CameraAccessPolicy.allows(base, page, base))
        }
        assertFalse(CameraAccessPolicy.allows("https://evil.test", "$base/app/profile", base))
    }
}
