package app.ziptalks.android;
import org.junit.Test;
import static org.junit.Assert.*;

public class StartupSnapshotPolicyTest {
    private final String user="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    private final String session="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    @Test public void localHintRequiresCurrentSessionAndApprovedDeviceHint() {
        assertTrue(StartupSnapshotPolicy.eligible(user,session,101,false,100000));
        assertFalse(StartupSnapshotPolicy.eligible(user,session,100,false,100000));
        assertFalse(StartupSnapshotPolicy.eligible(user,session,101,true,100000));
        assertFalse(StartupSnapshotPolicy.eligible(user,null,101,false,100000));
        assertFalse(StartupSnapshotPolicy.eligible("other-account",session,101,false,100000));
    }
    @Test public void cachedNavigationAcceptsOnlyChatIdentifiers() {
        assertTrue(StartupSnapshotPolicy.chatId(user));
        for(String value:new String[]{"https://example.invalid/","../login","",null,"javascript:alert(1)"})assertFalse(StartupSnapshotPolicy.chatId(value));
    }
}
