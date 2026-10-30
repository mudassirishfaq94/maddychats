package chat.circlo.admin;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-requested exports only. No legacy JavaScript interface, credential or arbitrary file access. */
final class AdminExports {
    static final int SAVE_DOCUMENT = 400;
    private static final String BRIDGE = "CircloAdminFiles";
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private String nonce;
    private String filename;
    private long deadline;
    private byte[] pendingBytes;
    private boolean picking;
    private boolean closed;

    AdminExports(Activity activity, WebView webView) {
        this.activity = activity; this.webView = webView;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, BRIDGE, Collections.singleton(AdminPolicy.ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !AdminPolicy.trusted(origin.toString()) || !AdminPolicy.trusted(view.getUrl()) || nonce == null || SystemClock.elapsedRealtime() > deadline) return;
                try {
                    String raw = message.getData();
                    if (raw == null || raw.length() > (AdminPolicy.MAX_EXPORT_BYTES * 4 / 3 + 8192)) throw new IllegalArgumentException();
                    JSONObject input = new JSONObject(raw);
                    String token = input.optString("nonce");
                    if (!nonce.equals(token)) return;
                    if (input.has("error")) throw new IllegalArgumentException();
                    String type = AdminPolicy.exportType(input.optString("type"));
                    if (type == null) throw new IllegalArgumentException();
                    byte[] bytes = Base64.decode(input.getString("data"), Base64.DEFAULT);
                    if (bytes.length > AdminPolicy.MAX_EXPORT_BYTES) throw new IllegalArgumentException();
                    finish(token, bytes, type);
                } catch (Exception ignored) { cancel(); notifyUser("This report could not be saved. Use a JSON, CSV or PDF export up to 16 MB."); }
            });
        }
        webView.setDownloadListener(this::download);
    }

    private void download(String url, String userAgent, String disposition, String type, long size) {
        if (closed || picking || !AdminPolicy.trusted(webView.getUrl())) return;
        if (size > AdminPolicy.MAX_EXPORT_BYTES) { notifyUser("This report is larger than 16 MB. Choose a smaller export."); return; }
        if (!AdminPolicy.trusted(url) && !AdminPolicy.trustedBlob(url)) { notifyUser("Open this download in your browser."); return; }
        cancel();
        String token = UUID.randomUUID().toString(); nonce = token; deadline = SystemClock.elapsedRealtime() + 60000;
        filename = AdminPolicy.filename(URLUtil.guessFileName(url, disposition, type));
        if (AdminPolicy.trustedBlob(url)) {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                cancel(); notifyUser("Update Android System WebView to save reports here, or use Open in browser."); return;
            }
            String script = "(async()=>{const nonce=" + JSONObject.quote(token) + ";try{const response=await fetch(" + JSONObject.quote(url) + ");const blob=await response.blob();if(blob.size>" + AdminPolicy.MAX_EXPORT_BYTES + ")throw Error();const reader=new FileReader();reader.onload=()=>" + BRIDGE + ".postMessage(JSON.stringify({nonce,type:blob.type,data:String(reader.result).split(',')[1]}));reader.onerror=()=>" + BRIDGE + ".postMessage(JSON.stringify({nonce,error:true}));reader.readAsDataURL(blob);}catch{" + BRIDGE + ".postMessage(JSON.stringify({nonce,error:true}));}})()";
            webView.evaluateJavascript(script, null);
            return;
        }
        String cookies = CookieManager.getInstance().getCookie(url);
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(15000); connection.setUseCaches(false);
                if (cookies != null) connection.setRequestProperty("Cookie", cookies);
                connection.setRequestProperty("User-Agent", userAgent);
                if (connection.getResponseCode() != 200) throw new IllegalStateException();
                String mime = AdminPolicy.exportType(connection.getContentType());
                if (mime == null || connection.getContentLengthLong() > AdminPolicy.MAX_EXPORT_BYTES) throw new IllegalStateException();
                byte[] bytes;
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] chunk = new byte[8192]; int count;
                    while ((count = input.read(chunk)) != -1) { if (output.size() + count > AdminPolicy.MAX_EXPORT_BYTES) throw new IllegalStateException(); output.write(chunk, 0, count); }
                    bytes = output.toByteArray();
                }
                activity.runOnUiThread(() -> finish(token, bytes, mime));
            } catch (Exception ignored) { activity.runOnUiThread(() -> { if (token.equals(nonce)) { cancel(); notifyUser("Could not download the report. Check your connection and sign-in, then try again."); } }); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private void finish(String token, byte[] bytes, String type) {
        if (closed || !token.equals(nonce) || !AdminPolicy.trusted(webView.getUrl()) || SystemClock.elapsedRealtime() > deadline) return;
        nonce = null; pendingBytes = bytes; picking = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE, filename);
        try { activity.startActivityForResult(intent, SAVE_DOCUMENT); }
        catch (Exception ignored) { cancel(); notifyUser("No file-saving app is available on this phone."); }
    }
    boolean isPicking() { return picking; }
    void documentResult(int resultCode, Intent result) {
        picking = false;
        byte[] bytes = pendingBytes; pendingBytes = null;
        Uri destination = result == null ? null : result.getData();
        if (resultCode != Activity.RESULT_OK || destination == null || bytes == null || !"content".equals(destination.getScheme())) return;
        worker.execute(() -> {
            try (OutputStream output = activity.getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new IllegalStateException();
                output.write(bytes); activity.runOnUiThread(() -> notifyUser("Report saved in the folder you chose."));
            } catch (Exception ignored) { activity.runOnUiThread(() -> notifyUser("Could not save the report. Try another folder.")); }
            finally { java.util.Arrays.fill(bytes, (byte) 0); }
        });
    }
    void cancel() { nonce = null; if (pendingBytes != null) java.util.Arrays.fill(pendingBytes, (byte) 0); pendingBytes = null; picking = false; }
    void close() { closed = true; cancel(); worker.shutdownNow(); }
    private void notifyUser(String text) { if (!closed) Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }
}
