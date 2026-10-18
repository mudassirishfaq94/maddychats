package app.ziptalks.android;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativeCallPolicyTest {
    private final String id = "12345678-1234-4123-8123-123456789012";
    private final String url = "ziptalks://chat/12345678-1234-4123-8123-123456789012?call=" + id;
    @Test public void acceptsBoundLiveCallOnly() {
        assertTrue(NativeCallPolicy.valid("user", "user", id, url, 45001, 1));
        assertFalse(NativeCallPolicy.valid("other", "user", id, url, 45001, 1));
        assertFalse(NativeCallPolicy.valid("user", "user", id, url, 1, 1));
        assertFalse(NativeCallPolicy.valid("user", "user", id, url, 45002, 1));
    }
    @Test public void rejectsForgedDestinationsAndActions() {
        for (String destination : new String[]{"https://attacker.invalid/", url + "&callAction=answer", url + "#x", url.replace("chat/", "attacker/"), url.replace(id + "?", "bad?"), "ziptalks://user@chat/" + id + "?call=" + id})
            assertFalse(destination, NativeCallPolicy.valid("user", "user", id, destination, 100, 1));
    }
}
