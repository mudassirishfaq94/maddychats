package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class NativeMessagePrivacyTest {
    @Test public void normalRemoteMessageHasNoIdentityOrText() {
        assertEquals("Circlo", NativeMessagePrivacy.title(false, false, null));
        assertEquals("Alex · Circlo", NativeMessagePrivacy.title(false, false, "Alex"));
        assertEquals("Circlo", NativeMessagePrivacy.title(false, true, "Alex"));
        assertEquals("New message received.", NativeMessagePrivacy.body(false, false));
    }
    @Test public void requestHasOnlyRequestWording() {
        assertEquals("New Message Request", NativeMessagePrivacy.title(true, false, null));
        assertEquals("You have received a new message request.", NativeMessagePrivacy.body(true, false));
    }
    @Test public void lockingOverridesRequestWording() {
        assertEquals("Circlo", NativeMessagePrivacy.title(true, true, null));
        assertEquals("New message received.", NativeMessagePrivacy.body(true, true));
    }
}
