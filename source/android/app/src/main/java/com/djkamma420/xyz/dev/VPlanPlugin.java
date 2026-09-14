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
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "VPlanBridge")
public class VPlanPlugin extends Plugin {
    private static final String STORE = "xyz_vplan_secure";
    private static final String KEY_ALIAS = "xyz_vplan_aes_v1";
    private static final int MAX_HARD_BYTES = 4 * 1024 * 1024;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final PortalHttpClient portal = new PortalHttpClient();

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
        try { prefs().edit().putString(key, encrypt(value)).apply(); call.resolve(); }
        catch (Exception e) { call.reject("Sicherer Speicher konnte nicht geschrieben werden.", "SECURE_STORAGE_ERROR"); }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (!validSecretKeyName(key)) { call.reject("Ungültiger Secure-Storage-Schlüssel.", "INVALID_ARGUMENT"); return; }
        try { JSObject out = new JSObject(); out.put("value", decrypt(prefs().getString(key, ""))); call.resolve(out); }
        catch (Exception e) { call.reject("Sicherer Speicher konnte nicht gelesen werden.", "SECURE_STORAGE_ERROR"); }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (!validSecretKeyName(key)) { call.reject("Ungültiger Secure-Storage-Schlüssel.", "INVALID_ARGUMENT"); return; }
        prefs().edit().remove(key).apply(); call.resolve();
    }

    @PluginMethod
    public void secureClear(PluginCall call) {
        network.execute(() -> { prefs().edit().clear().apply(); portal.clearAll(); call.resolve(); });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        String scope = call.getString("sessionScope", "");
        network.execute(() -> {
            try { portal.clearSession(scope); call.resolve(); }
            catch (IllegalArgumentException e) { call.reject("Ungültiges Portal-Profil.", "INVALID_ARGUMENT"); }
        });
    }

    @PluginMethod
    public void request(PluginCall call) {
        final String url = call.getString("url", "");
        final String method = call.getString("method", "GET");
        final String body = call.getString("body", "");
        final String scope = call.getString("sessionScope", "");
        final boolean reset = Boolean.TRUE.equals(call.getBoolean("resetSession", false));
        final JSObject supplied = call.getObject("headers", new JSObject());
        final Map<String, String> headers = new HashMap<>();
        Iterator<String> it = supplied.keys();
        while (it.hasNext()) { String key = it.next(); headers.put(key, supplied.optString(key, "")); }
        final int timeout = Math.min(Math.max(call.getInt("timeoutMs", 10000), 1000), 30000);
        final int maxBytes = Math.min(Math.max(call.getInt("maxBytes", 1024 * 1024), 1024), MAX_HARD_BYTES);
        network.execute(() -> {
            try {
                PortalHttpClient.Response response = portal.request(url, method, body, headers, scope, reset, timeout, maxBytes);
                JSObject out = new JSObject();
                out.put("status", response.status);
                out.put("body", response.body);
                out.put("contentType", response.contentType == null ? "" : response.contentType);
                out.put("date", response.date == null ? "" : response.date);
                out.put("url", response.url);
                call.resolve(out);
            } catch (java.net.SocketTimeoutException e) { call.reject("Zeitüberschreitung bei der Netzwerkanfrage.", "TIMEOUT"); }
            catch (SecurityException e) { call.reject("Nur HTTPS auf virtueller-stundenplan.org wird unterstützt.", "PORTAL_URL_UNGUELTIG"); }
            catch (Exception e) { call.reject("Portal-Netzwerkanfrage fehlgeschlagen.", "NETWORK_ERROR"); }
        });
    }
}
