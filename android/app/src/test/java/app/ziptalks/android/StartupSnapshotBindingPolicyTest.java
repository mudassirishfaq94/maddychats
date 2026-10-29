package app.ziptalks.android;
import org.junit.Test;
import static org.junit.Assert.*;

public class StartupSnapshotBindingPolicyTest {
    final String user="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    final String hash="a".repeat(64);
    boolean eligible(String refresh,String currentUser,String currentSession,boolean pending,long now) {
        return StartupSnapshotBindingPolicy.eligible(user,session,hash,1000,refresh,currentUser,currentSession,pending,now);
    }
    @Test public void sameRefreshAllowsOnlyReadOnlyHintAfterAccessCookieExpires() {
        assertTrue(eligible(hash,null,null,false,2000));
        assertTrue(eligible(hash,user,session,false,2000));
    }
    @Test public void logoutAndNewLoginCannotReuseThePreviousBinding() {
        assertFalse(eligible(null,null,null,false,2000));
        assertFalse(eligible("b".repeat(64),null,null,false,2000));
        assertFalse(eligible(hash,session,session,false,2000));
        assertFalse(eligible(hash,user,user,false,2000));
        assertFalse(eligible(hash,user,null,false,2000));
        assertFalse(eligible(hash,null,session,false,2000));
        assertFalse(eligible(hash,user,session,true,2000));
    }
    @Test public void bindingHasBoundedLifetimeAndRejectsClockRollbackAndBadState() {
        assertFalse(eligible(hash,null,null,false,999));
        assertFalse(eligible(hash,null,null,false,1000+StartupSnapshotBindingPolicy.MAX_AGE_MS));
        assertFalse(StartupSnapshotBindingPolicy.eligible("invalid",session,hash,1000,hash,null,null,false,2000));
        assertFalse(StartupSnapshotBindingPolicy.eligible(user,session,"invalid",1000,"invalid",null,null,false,2000));
    }
}
