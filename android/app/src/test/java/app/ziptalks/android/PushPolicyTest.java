package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class PushPolicyTest {
    private static final String ORIGIN = "https://circlo.chat";
    @Test public void bridgeRejectsFramesAndForeignOrNavigatedOrigins() {
        assertTrue(PushPolicy.allowsBridge(true, ORIGIN, ORIGIN + "/app", ORIGIN));
        assertFalse(PushPolicy.allowsBridge(false, ORIGIN, ORIGIN, ORIGIN));
        assertFalse(PushPolicy.allowsBridge(true, "https://circlo.chat.evil.test", ORIGIN, ORIGIN));
        assertFalse(PushPolicy.allowsBridge(true, ORIGIN, "https://evil.test", ORIGIN));
        assertFalse(PushPolicy.allowsBridge(true, "http://circlo.chat", ORIGIN, ORIGIN));
    }
    @Test public void eventRequiresCurrentAccountFreshnessAndBackground() {
        String id = "00000000-0000-4000-8000-000000000001";
        assertTrue(PushPolicy.acceptsEvent("a", "a", id, 2000, 1000, false));
        assertFalse(PushPolicy.acceptsEvent(null, "a", id, 2000, 1000, false));
        assertFalse(PushPolicy.acceptsEvent("a", "b", id, 2000, 1000, false));
        assertFalse(PushPolicy.acceptsEvent("a", "a", id, 1000, 1000, false));
        assertFalse(PushPolicy.acceptsEvent("a", "a", id, 9999999, 1000, false));
        assertFalse(PushPolicy.acceptsEvent("a", "a", id, 2000, 1000, true));
        assertFalse(PushPolicy.acceptsEvent("a", "a", "malformed", 2000, 1000, false));
    }
}
