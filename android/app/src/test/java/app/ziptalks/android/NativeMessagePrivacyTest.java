package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class NativeMessagePrivacyTest {
    @Test public void normalRemoteMessageHasNoIdentityOrText() {
        assertEquals("Circlo", NativeMessagePrivacy.title(false, false));
        assertEquals("New message received.", NativeMessagePrivacy.body(false, false));
    }
    @Test public void requestHasOnlyRequestWording() {
        assertEquals("New Message Request", NativeMessagePrivacy.title(true, false));
        assertEquals("You have received a new message request.", NativeMessagePrivacy.body(true, false));
    }
    @Test public void lockingOverridesRequestWording() {
        assertEquals("Circlo", NativeMessagePrivacy.title(true, true));
        assertEquals("New message received.", NativeMessagePrivacy.body(true, true));
    }
}
