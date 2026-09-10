package com.djkamma420.xyz.dev;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "VPlanBridge")
public class VPlanPlugin extends Plugin {
    private static final String STORE = "xyz_vplan_secure";
    private static final String KEY_ALIAS = "xyz_vplan_aes_v1";
    private static final int MAX_HARD_BYTES = 4 * 1024 * 1024;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);

    @Override
    protected void handleOnDestroy() {
        network.shutdownNow();
        super.handleOnDestroy();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    private static boolean validSecretKeyName(String key) {
        return key != null && key.matches("[A-Za-z0-9._-]{1,80}");
    }

    private SecretKey aesKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return gen.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, aesKey());
        byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return "1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
    }

    private String decrypt(String stored) throws Exception {
        if (stored == null || stored.isEmpty()) return "";
        String[] parts = stored.split(":", 3);
        if (parts.length != 3 || !"1".equals(parts[0])) throw new IllegalArgumentException("Unbekanntes Secure-Storage-Format");
        byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
        byte[] ct = Base64.decode(parts[2], Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, aesKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!validSecretKeyName(key) || value == null) { call.reject("Ungültiger Secure-Storage-Schlüssel.", "INVALID_ARGUMENT"); return; }
        try {
            prefs().edit().putString(key, encrypt(value)).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Sicherer Speicher konnte nicht geschrieben werden.", "SECURE_STORAGE_ERROR");
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (!validSecretKeyName(key)) { call.reject("Ungültiger Secure-Storage-Schlüssel.", "INVALID_ARGUMENT"); return; }
        try {
            JSObject out = new JSObject();
            out.put("value", decrypt(prefs().getString(key, "")));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Sicherer Speicher konnte nicht gelesen werden.", "SECURE_STORAGE_ERROR");
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (!validSecretKeyName(key)) { call.reject("Ungültiger Secure-Storage-Schlüssel.", "INVALID_ARGUMENT"); return; }
        prefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void secureClear(PluginCall call) {
        prefs().edit().clear().apply();
        cookies.getCookieStore().removeAll();
        call.resolve();
    }

    @PluginMethod
    public void request(PluginCall call) {
        final String url = call.getString("url");
        final String method = call.getString("method", "GET");
        final String body = call.getString("body", "");
        final JSObject headers = call.getObject("headers", new JSObject());
        final int timeout = Math.min(Math.max(call.getInt("timeoutMs", 10000), 1000), 30000);
        final int maxBytes = Math.min(Math.max(call.getInt("maxBytes", 1024 * 1024), 1024), MAX_HARD_BYTES);
        network.execute(() -> doRequest(call, url, method, body, headers, timeout, maxBytes));
    }

    private void doRequest(PluginCall call, String urlText, String methodRaw, String body, JSObject headers, int timeout, int maxBytes) {
        HttpsURLConnection conn = null;
        try {
            if (urlText == null) throw new IllegalArgumentException("URL fehlt");
            URL url = new URL(urlText);
            if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IllegalArgumentException("Nur HTTPS ist erlaubt");
            URI uri = url.toURI();
            conn = (HttpsURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(timeout);
            conn.setReadTimeout(timeout);
            String method = methodRaw == null ? "GET" : methodRaw.toUpperCase();
            if (!(method.equals("GET") || method.equals("POST") || method.equals("HEAD")))
                throw new IllegalArgumentException("HTTP-Methode nicht erlaubt");
            conn.setRequestMethod(method);
            conn.setRequestProperty("Accept", "application/json,text/html,text/plain,*/*");
            conn.setRequestProperty("User-Agent", "xyz-android/0.1.0");

            Map<String,List<String>> cookieHeaders = cookies.get(uri, Collections.emptyMap());
            for (Map.Entry<String,List<String>> h : cookieHeaders.entrySet())
                if (h.getKey() != null && !h.getValue().isEmpty()) conn.setRequestProperty(h.getKey(), String.join("; ", h.getValue()));

            if (headers != null) {
                Iterator<String> it = headers.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    if (!safeHeaderName(k)) continue;
                    String v = headers.optString(k, "");
                    if (!v.contains("\r") && !v.contains("\n")) conn.setRequestProperty(k, v);
                }
            }

            if (method.equals("POST")) {
                byte[] bytes = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
                if (bytes.length > maxBytes) throw new IllegalArgumentException("Request zu groß");
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
            }

            int status = conn.getResponseCode();
            cookies.put(uri, conn.getHeaderFields());
            long declared = conn.getContentLengthLong();
            if (declared > maxBytes) throw new IllegalStateException("Antwort zu groß");
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] bytes = readLimited(in, maxBytes);

            JSObject out = new JSObject();
            out.put("status", status);
            out.put("body", new String(bytes, StandardCharsets.UTF_8));
            out.put("contentType", conn.getContentType() == null ? "" : conn.getContentType());
            out.put("date", conn.getHeaderField("Date") == null ? "" : conn.getHeaderField("Date"));
            call.resolve(out);
        } catch (java.net.SocketTimeoutException e) {
            call.reject("Zeitüberschreitung beim Schulportal.", "TIMEOUT");
        } catch (Exception e) {
            call.reject("Netzwerkanfrage an das Schulportal fehlgeschlagen.", "NETWORK_ERROR");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static boolean safeHeaderName(String k) {
        if (k == null || !k.matches("[A-Za-z0-9-]{1,80}")) return false;
        String x = k.toLowerCase();
        return !(x.equals("host") || x.equals("content-length") || x.equals("cookie") || x.equals("set-cookie"));
    }

    private static byte[] readLimited(InputStream in, int maxBytes) throws Exception {
        if (in == null) return new byte[0];
        try (InputStream src = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int total = 0, n;
            while ((n = src.read(buf)) != -1) {
                total += n;
                if (total > maxBytes) throw new IllegalStateException("Antwort zu groß");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }
}
