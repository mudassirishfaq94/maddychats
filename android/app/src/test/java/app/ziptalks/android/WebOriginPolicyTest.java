package app.ziptalks.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class WebOriginPolicyTest {
    @Test public void onlyExactHttpsOriginCanStayInAppOrReceiveMicrophone() {
        assertTrue(WebOriginPolicy.isAllowed("https://circlo.chat/app/chats", "https://circlo.chat"));
        assertTrue(WebOriginPolicy.isAllowed("https://circlo.chat:443", "https://circlo.chat"));
        for (String url : new String[]{"http://circlo.chat", "https://circlo.chat.attacker.invalid", "https://attacker.invalid/circlo.chat", "https://circlo.chat:444", "https://user@circlo.chat", "javascript:alert(1)", "file:///tmp/test", "content://provider/path", "https://circlo.chat\\@attacker.invalid", "https://circlo.chat\n.attacker.invalid", "about:blank", ""}) {
            assertFalse(url, WebOriginPolicy.isAllowed(url, "https://circlo.chat"));
        }
    }
}
