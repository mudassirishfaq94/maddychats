package app.ziptalks.android;

import static org.junit.Assert.assertEquals;

import java.util.Map;
import org.junit.Test;

public class NativeNotificationTextTest {
    @Test
    public void displaysSenderAndPreview() {
        assertEquals("Alex", NativeNotificationText.title(Map.of("actorName", "Alex")));
        assertEquals("Are you free later?", NativeNotificationText.body(Map.of("preview", "Are you free later?")));
    }

    @Test
    public void prefersTheServerResolvedAlertText() {
        assertEquals("Alex \u00b7 Circlo", NativeNotificationText.title(Map.of("title", "Alex \u00b7 Circlo", "actorName", "Alex")));
        assertEquals(
            "Are you free later?",
            NativeNotificationText.body(Map.of("body", "Are you free later?", "preview", "stale preview")));
    }

    @Test
    public void fallsBackAndBoundsUntrustedText() {
        assertEquals("Circlo", NativeNotificationText.title(Map.of("actorName", "  \n ")));
        assertEquals("New message. Open Circlo to read it.", NativeNotificationText.body(Map.of()));
        assertEquals("Alex Friend", NativeNotificationText.title(Map.of("actorName", "Alex\u202e Friend")));
        assertEquals(140, NativeNotificationText.body(Map.of("preview", "x".repeat(200))).length());
        assertEquals(80, NativeNotificationText.title(Map.of("title", "y".repeat(120))).length());
    }
}