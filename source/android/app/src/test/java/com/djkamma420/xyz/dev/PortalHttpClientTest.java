package com.djkamma420.xyz.dev;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.*;
import java.net.URL;
import java.security.cert.Certificate;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

public class PortalHttpClientTest {
    private static final String LOGIN = "https://virtueller-stundenplan.org/index.php";
    private static final String DAY = "https://virtueller-stundenplan.org/page2/index.php";
    private static class Fake extends HttpsURLConnection {
        int status = 200;
        long length = -1;
        String body = "plan";
        boolean closed;
        Map<String, List<String>> headers = new HashMap<>();
        ByteArrayOutputStream sent = new ByteArrayOutputStream();
        Fake(String url) throws Exception { super(new URL(url)); }
        Fake redirect(int code, String location) { status = code; headers.put("Location", List.of(location)); return this; }
        Fake cookie(String value) { headers.put("Set-Cookie", List.of(value)); return this; }
        public int getResponseCode() { return status; }
        public Map<String, List<String>> getHeaderFields() { return headers; }
        public String getHeaderField(String name) { return headers.containsKey(name) ? headers.get(name).get(0) : null; }
        public long getContentLengthLong() { return length; }
        public InputStream getInputStream() { return new ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        public InputStream getErrorStream() { return getInputStream(); }
        public OutputStream getOutputStream() { return sent; }
        public void disconnect() { closed = true; }
        public boolean usingProxy() { return false; }
        public void connect() {}
        public String getCipherSuite() { return "test"; }
        public Certificate[] getLocalCertificates() { return null; }
        public Certificate[] getServerCertificates() { return null; }
    }
    private static class Harness {
        List<Fake> opened = new ArrayList<>();
        Deque<Fake> queue = new ArrayDeque<>();
        PortalHttpClient client = new PortalHttpClient(url -> {
            Fake next = queue.remove(); assertEquals(next.getURL(), url); opened.add(next); return next;
        });
        Harness(Fake... responses) { queue.addAll(Arrays.asList(responses)); }
        PortalHttpClient.Response request(String url, String verb, String scope, boolean reset) throws Exception {
            return client.request(url, verb, verb.equals("POST") ? "MAIL=user&SCHUELERCODE=secret" : "",
                Map.of("Content-Type", "application/x-www-form-urlencoded", "Authorization", "must-not-forward"), scope, reset, 1000, 1024);
        }
    }
    @Test public void currentLoginKeepsPreflightAndRedirectCookies() throws Exception {
        Fake pre = new Fake(LOGIN).cookie("PHPSESSID=pre; Path=/; Secure; HttpOnly");
        Fake post = new Fake(LOGIN).redirect(302, "/page2/index.php").cookie("PHPSESSID=logged; Path=/; Secure; HttpOnly");
        Fake day = new Fake(DAY);
        Harness h = new Harness(pre, post, day);
        h.request(LOGIN, "GET", "p1", true);
        PortalHttpClient.Response r = h.request(LOGIN, "POST", "p1", false);
        assertEquals(DAY, r.url); assertEquals(200, r.status);
        assertTrue(post.getRequestProperty("Cookie").contains("PHPSESSID=pre"));
        assertTrue(day.getRequestProperty("Cookie").contains("PHPSESSID=logged"));
        assertEquals("GET", day.getRequestMethod()); assertEquals(0, day.sent.size());
        assertNull(day.getRequestProperty("Content-Type")); assertNull(day.getRequestProperty("Authorization"));
        assertTrue(pre.closed && post.closed && day.closed);
    }
    @Test public void redirectMethodsMatchBrowserSemantics() throws Exception {
        for (int code : new int[]{301, 302, 303, 307, 308}) {
            Fake first = new Fake(LOGIN).redirect(code, "/page2/index.php"), next = new Fake(DAY);
            Harness h = new Harness(first, next); h.request(LOGIN, "POST", "", false);
            boolean preserve = code == 307 || code == 308;
            assertEquals(preserve ? "POST" : "GET", next.getRequestMethod());
            assertEquals(preserve ? first.sent.toString() : "", next.sent.toString());
        }
    }
    @Test public void dayRedirectToLoginIsReturnedForSessionExpiryDetection() throws Exception {
        Fake day = new Fake(DAY).redirect(302, "/index.php"), login = new Fake(LOGIN);
        login.body = "<input name=SCHUELERCODE>";
        Harness h = new Harness(day, login);
        assertTrue(h.request(DAY, "GET", "", false).body.contains("SCHUELERCODE"));
    }
    @Test public void foreignInitialAndRedirectUrlsAreRejectedBeforeConnection() throws Exception {
        for (String url : List.of("http://virtueller-stundenplan.org/index.php", "https://example.org/", "https://virtueller-stundenplan.org.evil.org/", "https://virtueller-stundenplan.org:444/", "https://user:pass@virtueller-stundenplan.org/", "https://www.virtueller-stundenplan.org/")) {
            Harness initial = new Harness();
            assertThrows(SecurityException.class, () -> initial.request(url, "GET", "", false));
            assertTrue(initial.opened.isEmpty());
            Fake first = new Fake(LOGIN).redirect(307, url);
            Harness redirect = new Harness(first);
            assertThrows(SecurityException.class, () -> redirect.request(LOGIN, "POST", "", false));
            assertEquals(1, redirect.opened.size()); assertTrue(first.closed);
        }
    }
    @Test public void redirectLoopAndMissingLocationFailClosed() throws Exception {
        Harness h = new Harness();
        for (int i = 0; i < 6; i++) h.queue.add(new Fake(LOGIN).redirect(302, "/index.php"));
        assertThrows(IllegalStateException.class, () -> h.request(LOGIN, "GET", "", false));
        assertEquals(6, h.opened.size()); assertTrue(h.opened.stream().allMatch(x -> x.closed));
        Fake missing = new Fake(LOGIN); missing.status = 302;
        assertThrows(IllegalStateException.class, () -> new Harness(missing).request(LOGIN, "GET", "", false));
    }
    @Test public void sessionsAreIsolatedResetAndRemovedOnLogout() throws Exception {
        Fake first = new Fake(LOGIN).cookie("PHPSESSID=alice; Path=/; Secure");
        Fake bob = new Fake(DAY), alice = new Fake(DAY), reset = new Fake(LOGIN), after = new Fake(DAY);
        Harness h = new Harness(first, bob, alice, reset, after);
        h.request(LOGIN, "GET", "alice", true);
        h.request(DAY, "GET", "bob", false); assertNull(bob.getRequestProperty("Cookie"));
        h.request(DAY, "GET", "alice", false); assertTrue(alice.getRequestProperty("Cookie").contains("alice"));
        h.request(LOGIN, "GET", "alice", true); assertNull(reset.getRequestProperty("Cookie"));
        h.client.clearSession("alice"); h.request(DAY, "GET", "alice", false); assertNull(after.getRequestProperty("Cookie"));
    }
    @Test public void logoutActuallyRemovesAuthenticatedCookie() throws Exception {
        Fake first = new Fake(LOGIN).cookie("PHPSESSID=alice; Path=/; Secure"), after = new Fake(DAY);
        Harness h = new Harness(first, after); h.request(LOGIN, "GET", "a", true);
        h.client.clearSession("a"); h.request(DAY, "GET", "a", false);
        assertNull(after.getRequestProperty("Cookie"));
    }
    @Test public void responseSizeLimitsApplyToDeclaredAndStreamedBodies() throws Exception {
        Fake declared = new Fake(LOGIN); declared.length = 2048;
        assertThrows(IllegalStateException.class, () -> new Harness(declared).request(LOGIN, "GET", "", false));
        Fake streamed = new Fake(LOGIN); streamed.body = "x".repeat(1025);
        assertThrows(IllegalStateException.class, () -> new Harness(streamed).request(LOGIN, "GET", "", false));
        assertTrue(declared.closed && streamed.closed);
    }
    @Test public void invalidMethodScopeAndResetCannotMakeRequests() throws Exception {
        Harness h = new Harness();
        assertThrows(IllegalArgumentException.class, () -> h.request(DAY, "POST", "", false));
        assertThrows(IllegalArgumentException.class, () -> h.request(DAY, "GET", "", true));
        assertThrows(IllegalArgumentException.class, () -> h.request(LOGIN, "DELETE", "", false));
        assertThrows(IllegalArgumentException.class, () -> h.request(LOGIN, "GET", "bad/scope", false));
        assertTrue(h.opened.isEmpty());
    }
}
