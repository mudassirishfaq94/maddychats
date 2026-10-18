package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeCallIdentityTest {
    @Test public void callerNamesRespectPrivacyAndUntrustedMetadata() {
        assertEquals("Alex Johnson", NativeCallIdentity.name("Alex Johnson · Circlo", false));
        assertEquals("Circlo", NativeCallIdentity.name("Alex Johnson · Circlo", true));
        assertEquals("Circlo", NativeCallIdentity.name(null, false));
        assertEquals("Alex Johnson", NativeCallIdentity.name(" Alex\nJohnson\u202e ", false));
        String emoji = "😀".repeat(90);
        String bounded = NativeCallIdentity.name(emoji, false);
        assertEquals(80, bounded.codePointCount(0, bounded.length()));
    }
    @Test public void clearingMessageAlertsPreservesIncomingAndActiveCalls() {
        assertTrue(PushPolicy.isMessageTag("circlo-chat-123"));
        assertTrue(PushPolicy.isMessageTag("circlo-messages"));
        assertFalse(PushPolicy.isMessageTag("circlo-call-123"));
        assertFalse(PushPolicy.isMessageTag("circlo-active-call"));
        assertFalse(PushPolicy.isMessageTag(null));
    }
    @Test public void retryPreservesSameAccountButSwitchDetachesPreviousAccount() {
        assertFalse(PushPolicy.switchesAccount("alice", "alice"));
        assertFalse(PushPolicy.switchesAccount(null, "alice"));
        assertTrue(PushPolicy.switchesAccount("alice", "bob"));
    }
}
