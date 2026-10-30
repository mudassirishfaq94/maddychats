package chat.circlo.admin;

import org.junit.Test;
import static org.junit.Assert.*;

public class AdminPolicyTest {
    @Test public void originChecksRejectRedirectTricksAndActiveSchemes() {
        assertTrue(AdminPolicy.trusted("https://circlo.chat/app/admin?tab=users"));
        assertTrue(AdminPolicy.trusted("https://circlo.chat:443/login"));
        for (String value : new String[]{"http://circlo.chat", "https://circlo.chat.evil.test/", "https://circlo.chat@evil.test/", "https://u@circlo.chat/", "https://circlo.chat:8443/", "https://circlo.chat./", "https://circlo.chat\\@evil.test/", "javascript:alert(1)", "file:///data/data/private", "data:text/html,test", "intent://circlo.chat", "https://circlo.chat\n.evil.test"}) assertFalse(value, AdminPolicy.trusted(value));
        assertFalse(AdminPolicy.externalHttps("https://secret@outside.test/"));
        assertFalse(AdminPolicy.externalHttps("javascript:alert(1)"));
    }
    @Test public void blobAndExportPoliciesNeverPermitActiveDocuments() {
        assertTrue(AdminPolicy.trustedBlob("blob:https://circlo.chat/owned-export"));
        assertFalse(AdminPolicy.trustedBlob("blob:https://evil.test/export"));
        assertEquals("application/json", AdminPolicy.exportType("Application/JSON; charset=utf-8"));
        for (String value : new String[]{"text/html", "application/xhtml+xml", "image/svg+xml", "application/javascript", "application/octet-stream"}) assertNull(value, AdminPolicy.exportType(value));
        String filename = AdminPolicy.filename("../secret\\file\r\n.json");
        assertFalse(filename.contains("/")); assertFalse(filename.contains("\\")); assertFalse(filename.contains("\r")); assertFalse(filename.contains("\n"));
        assertFalse(filename.startsWith("."));
    }
}
