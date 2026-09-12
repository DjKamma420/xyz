package com.djkamma420.xyz.dev;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "XyzUpdate")
public class UpdatePlugin extends Plugin {
    private static final String RELEASE_API = "https://api.github.com/repos/DjKamma420/xyz/releases/tags/preview";
    private static final String PRIVATE_DOWNLOAD = "https://github.com/DjKamma420/xyz/releases/download/preview/xyz.apk";
    private static final long MAX_APK_BYTES = 150L * 1024L * 1024L;
    private static final long MAX_JSON_BYTES = 512L * 1024L;
    private static final Pattern VERSION = Pattern.compile("(?:^|[^0-9])(\\d+)\\.(\\d+)\\.(\\d+)(?:[^0-9]|$)");
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private static class SourcePrivateException extends Exception {
        SourcePrivateException() { super("GitHub-Release ist ohne Anmeldung nicht erreichbar."); }
    }

    private static class ReleaseInfo {
        String version;
        String downloadUrl;
        String digest;
    }

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            call.resolve(installedVersionObject());
        } catch (Exception e) {
            call.reject("Installierte Version konnte nicht gelesen werden.", "VERSION_READ_FAILED", e);
        }
    }

    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        executor.execute(() -> {
            try {
                JSObject installed = installedVersionObject();
                ReleaseInfo release = fetchRelease();
                String local = installed.getString("versionName", "0.0.0");
                JSObject out = new JSObject();
                out.put("sourceAvailable", true);
                out.put("installedVersion", local);
                out.put("latestVersion", release.version);
                out.put("updateAvailable", compareVersions(local, release.version) < 0);
                out.put("digest", release.digest);
                call.resolve(out);
            } catch (SourcePrivateException e) {
                try {
                    JSObject installed = installedVersionObject();
                    JSObject out = new JSObject();
                    out.put("sourceAvailable", false);
                    out.put("privateRepository", true);
                    out.put("installedVersion", installed.getString("versionName", "0.0.0"));
                    out.put("updateAvailable", false);
                    out.put("browserDownloadUrl", PRIVATE_DOWNLOAD);
                    call.resolve(out);
                } catch (Exception nested) {
                    call.reject("Updatequelle konnte nicht geprüft werden.", "UPDATE_CHECK_FAILED", nested);
                }
            } catch (Exception e) {
                call.reject("Updatequelle konnte nicht geprüft werden.", "UPDATE_CHECK_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void installLatest(PluginCall call) {
        if (!canInstallPackages()) {
            openInstallSettings();
            call.reject("Installationsberechtigung fehlt.", "INSTALL_PERMISSION_REQUIRED");
            return;
        }
        executor.execute(() -> {
            try {
                ReleaseInfo release = fetchRelease();
                String local = installedVersionObject().getString("versionName", "0.0.0");
                if (compareVersions(local, release.version) >= 0) {
                    JSObject out = new JSObject();
                    out.put("noUpdate", true);
                    out.put("installedVersion", local);
                    call.resolve(out);
                    return;
                }
                if (release.digest == null || !release.digest.toLowerCase(Locale.ROOT).startsWith("sha256:")) {
                    call.reject("Release enthält keine SHA-256-Prüfsumme.", "UPDATE_DIGEST_MISSING");
                    return;
                }
                File apk = new File(getContext().getCacheDir(), "xyz-update.apk");
                String actual = downloadApk(release.downloadUrl, apk);
                String expected = release.digest.substring("sha256:".length()).toLowerCase(Locale.ROOT);
                if (!actual.equals(expected)) {
                    apk.delete();
                    call.reject("Die heruntergeladene APK hat eine falsche Prüfsumme.", "UPDATE_DIGEST_MISMATCH");
                    return;
                }
                launchInstaller(apk);
                JSObject out = new JSObject();
                out.put("installerOpened", true);
                out.put("version", release.version);
                call.resolve(out);
            } catch (SourcePrivateException e) {
                call.reject(e.getMessage(), "UPDATE_SOURCE_PRIVATE", e);
            } catch (Exception e) {
                call.reject("Update konnte nicht installiert werden.", "UPDATE_INSTALL_FAILED", e);
            }
        });
    }

    @PluginMethod
    public void openPrivateDownload(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PRIVATE_DOWNLOAD));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = new JSObject();
            out.put("opened", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("GitHub-Download konnte nicht geöffnet werden.", "BROWSER_OPEN_FAILED", e);
        }
    }

    private JSObject installedVersionObject() throws Exception {
        PackageManager pm = getContext().getPackageManager();
        PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), 0);
        JSObject out = new JSObject();
        out.put("versionName", info.versionName == null ? "0.0.0" : info.versionName);
        long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        out.put("versionCode", code);
        return out;
    }

    private ReleaseInfo fetchRelease() throws Exception {
        URL url = new URL(RELEASE_API);
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        connection.setRequestProperty("User-Agent", "xyz-android-updater");
        int status = connection.getResponseCode();
        if (status == 404) {
            connection.disconnect();
            throw new SourcePrivateException();
        }
        if (status < 200 || status >= 300) {
            connection.disconnect();
            throw new IllegalStateException("GitHub HTTP " + status);
        }
        String body;
        try (InputStream input = connection.getInputStream()) {
            body = new String(readLimited(input, MAX_JSON_BYTES), StandardCharsets.UTF_8);
        } finally {
            connection.disconnect();
        }
        JSONObject json = new JSONObject(body);
        String name = json.optString("name", "");
        String version = extractVersion(name);
        if (version == null) version = extractVersion(json.optString("body", ""));
        if (version == null) throw new IllegalStateException("Release-Version fehlt.");
        JSONArray assets = json.optJSONArray("assets");
        if (assets == null) throw new IllegalStateException("Release-Assets fehlen.");
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset == null || !"xyz.apk".equals(asset.optString("name"))) continue;
            String download = asset.optString("browser_download_url", "");
            if (!isExpectedDownloadUrl(download)) throw new SecurityException("Unerwartete APK-URL.");
            ReleaseInfo info = new ReleaseInfo();
            info.version = version;
            info.downloadUrl = download;
            info.digest = asset.optString("digest", "");
            return info;
        }
        throw new IllegalStateException("xyz.apk fehlt im Release.");
    }

    private String downloadApk(String initialUrl, File target) throws Exception {
        if (!isExpectedDownloadUrl(initialUrl)) throw new SecurityException("Unerwartete APK-URL.");
        URL current = new URL(initialUrl);
        for (int redirects = 0; redirects < 8; redirects++) {
            validateHttpsHost(current);
            HttpsURLConnection connection = (HttpsURLConnection) current.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "xyz-android-updater");
            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_PERM || status == HttpURLConnection.HTTP_MOVED_TEMP ||
                    status == HttpURLConnection.HTTP_SEE_OTHER || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isBlank()) throw new IllegalStateException("Redirect ohne Ziel.");
                current = new URL(current, location);
                continue;
            }
            if (status < 200 || status >= 300) {
                connection.disconnect();
                throw new IllegalStateException("APK-Download HTTP " + status);
            }
            long length = connection.getContentLengthLong();
            if (length > MAX_APK_BYTES) {
                connection.disconnect();
                throw new IllegalStateException("APK ist unerwartet groß.");
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream raw = new BufferedInputStream(connection.getInputStream());
                 BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(target))) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = raw.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_APK_BYTES) throw new IllegalStateException("APK überschreitet Größenlimit.");
                    digest.update(buffer, 0, read);
                    out.write(buffer, 0, read);
                }
            } finally {
                connection.disconnect();
            }
            if (total < 1024) throw new IllegalStateException("APK-Download ist leer oder unvollständig.");
            return hex(digest.digest());
        }
        throw new IllegalStateException("Zu viele Redirects beim APK-Download.");
    }

    private void launchInstaller(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.setClipData(ClipData.newRawUri("xyz.apk", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void openInstallSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private static byte[] readLimited(InputStream input, long max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > max) throw new IllegalStateException("Antwort überschreitet Größenlimit.");
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static String extractVersion(String text) {
        Matcher m = VERSION.matcher(text == null ? "" : text);
        return m.find() ? m.group(1) + "." + m.group(2) + "." + m.group(3) : null;
    }

    private static int compareVersions(String a, String b) {
        int[] x = parseVersion(a), y = parseVersion(b);
        for (int i = 0; i < 3; i++) {
            if (x[i] != y[i]) return Integer.compare(x[i], y[i]);
        }
        return 0;
    }

    private static int[] parseVersion(String value) {
        Matcher m = VERSION.matcher(value == null ? "" : value);
        if (!m.find()) return new int[]{0, 0, 0};
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3))};
    }

    private static boolean isExpectedDownloadUrl(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "github.com".equalsIgnoreCase(uri.getHost()) &&
                    "/DjKamma420/xyz/releases/download/preview/xyz.apk".equals(uri.getPath()) &&
                    uri.getUserInfo() == null;
        } catch (Exception e) {
            return false;
        }
    }

    private static void validateHttpsHost(URL url) throws Exception {
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new SecurityException("Nur HTTPS ist erlaubt.");
        String host = url.getHost().toLowerCase(Locale.ROOT);
        boolean allowed = host.equals("github.com") || host.equals("release-assets.githubusercontent.com") ||
                host.endsWith(".githubusercontent.com");
        if (!allowed) throw new SecurityException("Unerwarteter Download-Host: " + host);
        if (url.getUserInfo() != null) throw new SecurityException("URL-Zugangsdaten sind nicht erlaubt.");
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return out.toString();
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
