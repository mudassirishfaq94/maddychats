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
    public void fallsBackAndBoundsUntrustedText() {
        assertEquals("Circlo", NativeNotificationText.title(Map.of("actorName", "  \n ")));
        assertEquals("New activity. Open Circlo to view it.", NativeNotificationText.body(Map.of()));
        assertEquals("Alex Friend", NativeNotificationText.title(Map.of("actorName", "Alex\u202e Friend")));
        assertEquals(140, NativeNotificationText.body(Map.of("preview", "x".repeat(200))).length());
    }
}