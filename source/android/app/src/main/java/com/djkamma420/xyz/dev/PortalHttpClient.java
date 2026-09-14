package com.djkamma420.xyz.dev;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** Portal-only transport. Used serially by VPlanPlugin's network executor. */
final class PortalHttpClient {
    interface ConnectionFactory { HttpsURLConnection open(URL url) throws Exception; }
    static final class Response {
        final int status;
        final String body, contentType, date, url;
        Response(int status, String body, String contentType, String date, String url) {
            this.status = status; this.body = body; this.contentType = contentType;
            this.date = date; this.url = url;
        }
    }
    private final ConnectionFactory connections;
    private final Map<String, CookieManager> sessions = new HashMap<>();

    PortalHttpClient() { this(url -> (HttpsURLConnection) url.openConnection()); }
    PortalHttpClient(ConnectionFactory connections) { this.connections = connections; }

    static boolean isPortalUrl(URL url) {
        return url != null && "https".equalsIgnoreCase(url.getProtocol())
            && "virtueller-stundenplan.org".equalsIgnoreCase(url.getHost())
            && (url.getPort() == -1 || url.getPort() == 443)
            && url.getUserInfo() == null;
    }
    private static boolean isLoginUrl(URL url) {
        return isPortalUrl(url) && (url.getPath().isEmpty() || "/".equals(url.getPath())
            || "/index.php".equals(url.getPath()));
    }
    private static String scope(String value) {
        if (value == null || !value.matches("[A-Za-z0-9._-]{0,32}"))
            throw new IllegalArgumentException("Ungültiges Portal-Profil");
        return value;
    }
    void clearSession(String value) { sessions.remove(scope(value)); }
    void clearAll() { sessions.clear(); }

    Response request(String urlText, String method, String body, Map<String, String> headers,
                     String sessionScope, boolean resetSession, int timeout, int maxBytes) throws Exception {
        URL current = new URL(urlText);
        if (!isPortalUrl(current)) throw new SecurityException("Nur virtueller-stundenplan.org ist erlaubt");
        String verb = method.toUpperCase(Locale.ROOT);
        if (!(verb.equals("GET") || verb.equals("HEAD") || (verb.equals("POST") && isLoginUrl(current))))
            throw new IllegalArgumentException("HTTP-Methode nicht erlaubt");
        String key = scope(sessionScope);
        if (resetSession) {
            if (!verb.equals("GET") || !isLoginUrl(current)) throw new IllegalArgumentException("Ungültiger Sitzungsstart");
            clearSession(key);
        }
        CookieManager cookies = sessions.computeIfAbsent(key,
            ignored -> new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER));
        byte[] requestBytes = body.getBytes(StandardCharsets.UTF_8);
        if (requestBytes.length > maxBytes) throw new IllegalStateException("Request zu groß");
        for (int redirects = 0; ; redirects++) {
            HttpsURLConnection conn = connections.open(current);
            try {
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(timeout);
                conn.setReadTimeout(timeout);
                conn.setRequestMethod(verb);
                conn.setRequestProperty("User-Agent", "xyz-android/0.4.1");
                conn.setRequestProperty("Accept", "text/html,*/*");
                for (Map.Entry<String, List<String>> h : cookies.get(current.toURI(), Collections.emptyMap()).entrySet())
                    if (h.getKey() != null && !h.getValue().isEmpty())
                        conn.setRequestProperty(h.getKey(), String.join("; ", h.getValue()));
                for (Map.Entry<String, String> h : headers.entrySet()) {
                    String name = h.getKey(), value = h.getValue();
                    if (!("Accept".equalsIgnoreCase(name) || (verb.equals("POST") && "Content-Type".equalsIgnoreCase(name)))) continue;
                    if (!value.contains("\r") && !value.contains("\n")) conn.setRequestProperty(name, value);
                }
                if (verb.equals("POST")) {
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(requestBytes.length);
                    try (OutputStream out = conn.getOutputStream()) { out.write(requestBytes); }
                }
                int status = conn.getResponseCode();
                cookies.put(current.toURI(), conn.getHeaderFields());
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) throw new IllegalStateException("Portal-Weiterleitung ohne Ziel");
                    if (redirects >= 5) throw new IllegalStateException("Zu viele Portal-Weiterleitungen");
                    URL next = new URL(current, location);
                    if (!isPortalUrl(next)) throw new SecurityException("Portal-Weiterleitung verlässt virtueller-stundenplan.org");
                    if ((verb.equals("POST") && (status == 301 || status == 302)) || (status == 303 && !verb.equals("HEAD"))) verb = "GET";
                    current = next;
                    continue;
                }
                if (conn.getContentLengthLong() > maxBytes) throw new IllegalStateException("Antwort zu groß");
                String response = new String(readLimited(status >= 400 ? conn.getErrorStream() : conn.getInputStream(), maxBytes), StandardCharsets.UTF_8);
                return new Response(status, response, conn.getContentType(), conn.getHeaderField("Date"), current.toString());
            } finally { conn.disconnect(); }
        }
    }
    private static byte[] readLimited(InputStream in, int maxBytes) throws Exception {
        if (in == null) return new byte[0];
        try (InputStream src = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192]; int total = 0, n;
            while ((n = src.read(buf)) != -1) {
                total += n;
                if (total > maxBytes) throw new IllegalStateException("Antwort zu groß");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }
}
