package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class NativeMessagePrivacyTest {
    @Test public void normalRemoteMessageHasNoIdentityOrText() {
        assertEquals("Circlo", NativeMessagePrivacy.title(false, false, null));
        assertEquals("Alex · Circlo", NativeMessagePrivacy.title(false, false, "Alex"));
        assertEquals("Circlo", NativeMessagePrivacy.title(false, true, "Alex"));
        assertEquals("Sent you a message. Open Circlo to read it.", NativeMessagePrivacy.body(false, false));
        assertEquals("Open Circlo to view your message.", NativeMessagePrivacy.body(false, true));
        assertEquals("Sent you a video. Open Circlo to watch it.", NativeMessagePrivacy.body(false, false, "video"));
        assertEquals("You have a new message. Open Circlo to read it.", NativeMessagePrivacy.body(false, false, "video", null, false, false));
        assertEquals("Ayesha sent you a video. Open Circlo to watch it.", NativeMessagePrivacy.body(false, false, "video", "Ayesha", true));
    }
    @Test public void requestHasOnlyRequestWording() {
        assertEquals("New Message Request", NativeMessagePrivacy.title(true, false, null));
        assertEquals("You have received a new message request.", NativeMessagePrivacy.body(true, false));
    }
    @Test public void lockingOverridesRequestWording() {
        assertEquals("Circlo", NativeMessagePrivacy.title(true, true, null));
        assertEquals("Open Circlo to view your message.", NativeMessagePrivacy.body(true, true));
    }
}
