package app.ziptalks.android;
import org.junit.Test;
import static org.junit.Assert.*;
public class PublicAppLinkTest {
    @Test public void contactAndInviteLinksStayOnTheCanonicalOrigin() {
        String base="https://circlo.chat", contact="/contact/12345678-1234-4234-8234-123456789abc", invite="/invite/abcdef0123456789abcdef0123456789";
        assertEquals(base+contact,PublicAppLink.destination(base+contact,base));
        assertEquals(base+invite,PublicAppLink.destination(base+invite,base));
        for(String raw:new String[]{"http://circlo.chat"+contact,"https://evil.example"+contact,"https://circlo.chat.evil.example"+contact,base+contact+"?next=https://evil.example",base+contact+"#x","https://circlo.chat@evil.example"+contact,base+"/contact/not-an-id",base+"/invite/not-a-code"})assertNull(PublicAppLink.destination(raw,base));
    }
}
