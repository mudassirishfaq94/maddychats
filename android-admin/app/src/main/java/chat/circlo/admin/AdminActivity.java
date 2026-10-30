package chat.circlo.admin;

import android.Manifest;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Separate admin application; all privileges, MFA and destructive-action checks stay on the server. */
public final class AdminActivity extends ComponentActivity {
    private static final int UNLOCK = 410, PICK_FILE = 411, CAMERA = 412;
    private static final int BACKGROUND = Color.rgb(21, 23, 25), TEXT = Color.rgb(248, 249, 250);
    private WebView webView;
    private ProgressBar progress;
    private LinearLayout cover;
    private TextView coverTitle, coverMessage;
    private Button coverAction, browserAction;
    private AdminExports exports;
    private ValueCallback<Uri[]> fileSelection;
    private PermissionRequest cameraRequest;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private boolean locked = true, unlocking, unlockAttempted, picking, pageFailed, clearHistory, rendererGone;
    private String lastError = "Cannot connect to Circlo. Try again.";
    private long backgroundAt;
    private KeyguardManager keyguard;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { goBack(); }
        });
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (!lockEnabled()) locked = false;
        buildViews();
        configureWebView();
        exports = new AdminExports(this, webView);
        webView.loadUrl(AdminPolicy.HOME);
    }

    private void buildViews() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BACKGROUND);
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom)); return insets;
        }); else root.setFitsSystemWindows(true);
        LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL); toolbar.setPadding(dp(8), 0, dp(8), 0);
        Button back = button("‹", v -> goBack()); back.setContentDescription("Go back"); toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView title = new TextView(this); title.setText("Circlo Admin"); title.setTextColor(TEXT); title.setTextSize(16); title.setTypeface(null, android.graphics.Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1)); title.setGravity(Gravity.CENTER_VERTICAL);
        Button menu = button("⋮", this::showMenu); menu.setContentDescription("Admin app menu"); toolbar.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(48)));
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setMax(100); root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        FrameLayout frame = new FrameLayout(this); webView = new WebView(this); webView.setBackgroundColor(BACKGROUND); frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        cover = new LinearLayout(this); cover.setOrientation(LinearLayout.VERTICAL); cover.setGravity(Gravity.CENTER); cover.setPadding(dp(28), dp(24), dp(28), dp(24)); cover.setBackgroundColor(BACKGROUND);
        coverTitle = new TextView(this); coverTitle.setTextColor(TEXT); coverTitle.setTextSize(23); coverTitle.setGravity(Gravity.CENTER); cover.addView(coverTitle);
        coverMessage = new TextView(this); coverMessage.setTextColor(Color.LTGRAY); coverMessage.setTextSize(15); coverMessage.setGravity(Gravity.CENTER); coverMessage.setPadding(0, dp(16), 0, dp(16)); cover.addView(coverMessage);
        coverAction = button("Unlock", v -> unlock()); cover.addView(coverAction, new LinearLayout.LayoutParams(-1, dp(52)));
        browserAction = button("Open admin in browser", v -> openBrowser(AdminPolicy.HOME)); cover.addView(browserAction, new LinearLayout.LayoutParams(-1, dp(52)));
        frame.addView(cover, new FrameLayout.LayoutParams(-1, -1)); root.addView(frame, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root); if (locked) showLock(); else cover.setVisibility(View.GONE);
    }

    @SuppressWarnings("deprecation") private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true); settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true); settings.setUserAgentString(settings.getUserAgentString() + " CircloAdmin/" + BuildConfig.VERSION_NAME);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String value = request.getUrl().toString();
                if (!request.isForMainFrame()) return !"https".equalsIgnoreCase(request.getUrl().getScheme());
                if (AdminPolicy.trusted(value)) {
                    if (request.getUrl().getPath() != null && request.getUrl().getPath().startsWith("/api/auth/google")) {
                        openBrowser(value); notifyUser("Google sign-in continues in your browser. Use email and password to sign in inside this app."); return true;
                    }
                    return false;
                }
                if (AdminPolicy.externalHttps(value)) openBrowser(value);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("file".equalsIgnoreCase(scheme) || "content".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!AdminPolicy.trusted(url)) { view.stopLoading(); showError("This page cannot open in Circlo Admin."); return; }
                if (exports != null) exports.cancel(); cancelCamera(); pageFailed = false; progress.setVisibility(View.VISIBLE);
                String path = Uri.parse(url).getPath(); if ("/login".equals(path)) clearHistory = true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush(); progress.setVisibility(View.GONE);
                if (clearHistory) { view.clearHistory(); clearHistory = false; }
                if (!locked && !pageFailed) cover.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("Cannot connect to Circlo. Check your internet connection, then try again.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame() && error.getStatusCode() >= 500) showError("Circlo is not responding right now. Try again shortly.");
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); showError("The secure connection could not be verified. Check your phone's date and connection, then try again.");
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                rendererGone = true; ((ViewGroup) view.getParent()).removeView(view); view.destroy(); new AlertDialog.Builder(AdminActivity.this).setTitle("Reopen Circlo Admin").setMessage("The page stopped. Reopen the app to continue.").setPositiveButton("Reopen", (dialog, which) -> recreate()).setCancelable(false).show(); return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> requestCamera(request)); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { runOnUiThread(() -> { if (cameraRequest == request) cameraRequest = null; }); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams parameters) {
                if (!AdminPolicy.trusted(view.getUrl())) { callback.onReceiveValue(null); return true; }
                if (fileSelection != null) fileSelection.onReceiveValue(null);
                fileSelection = callback; picking = true;
                try { startActivityForResult(parameters.createIntent(), PICK_FILE); }
                catch (Exception ignored) { fileSelection = null; picking = false; callback.onReceiveValue(null); notifyUser("No file picker is available."); }
                return true;
            }
        });
    }

    private void showMenu(View anchor) {
        if (locked || rendererGone) return;
        PopupMenu menu = new PopupMenu(this, anchor);
        String[] labels = {"Overview", "Control room", "Users", "Reports", "Storage", "Sign-in security", "Admin history", "Reload", "Open in browser", "Lock now", "Require phone unlock when reopening", "Sign out of this app"};
        for (int i = 0; i < labels.length; i++) menu.getMenu().add(0, i, i, labels[i]);
        menu.getMenu().findItem(10).setCheckable(true).setChecked(lockEnabled());
        menu.setOnMenuItemClickListener(item -> {
            String[] routes = {"", "/operations", "/users", "/reports", "/storage", "/security", "/audit"}; int id = item.getItemId();
            if (id < routes.length) navigate(AdminPolicy.HOME + routes[id]);
            else if (id == 7) reload();
            else if (id == 8) openBrowser(AdminPolicy.trusted(webView.getUrl()) ? webView.getUrl() : AdminPolicy.HOME);
            else if (id == 9) { if (keyguard.isDeviceSecure()) { locked = true; showLock(); unlock(); } else notifyUser("Set a phone screen lock first to use this option."); }
            else if (id == 10) {
                if (!keyguard.isDeviceSecure()) { startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS)); notifyUser("Set a phone screen lock, then turn this option on."); }
                else getPreferences(MODE_PRIVATE).edit().putBoolean("device_lock", !lockEnabled()).apply();
            } else if (id == 11) new AlertDialog.Builder(this).setTitle("Sign out of Circlo Admin?").setMessage("This signs out the account in this app. Your regular Circlo app stays separate.").setNegativeButton("Cancel", null).setPositiveButton("Sign out", (dialog, which) -> signOut()).show();
            return true;
        }); menu.show();
    }

    private void requestCamera(PermissionRequest request) {
        if (!AdminPolicy.trusted(request.getOrigin().toString()) || !AdminPolicy.trusted(webView.getUrl()) || !Arrays.equals(request.getResources(), new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE})) { request.deny(); return; }
        cancelCamera(); cameraRequest = request;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); cameraRequest = null; }
        else requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA);
    }
    private void cancelCamera() { if (cameraRequest != null) { cameraRequest.deny(); cameraRequest = null; } }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA && cameraRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED && AdminPolicy.trusted(webView.getUrl())) cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); else cameraRequest.deny();
            cameraRequest = null;
        }
    }

    private boolean lockEnabled() { return keyguard != null && keyguard.isDeviceSecure() && getPreferences(MODE_PRIVATE).getBoolean("device_lock", true); }
    private void showLock() { coverTitle.setText("Circlo Admin is locked"); coverMessage.setText("Use your phone screen lock to reopen admin tools. Your Circlo sign-in checks still apply."); browserAction.setVisibility(View.GONE); coverAction.setVisibility(View.VISIBLE); coverAction.setText("Unlock"); coverAction.setOnClickListener(v -> unlock()); cover.setVisibility(View.VISIBLE); }
    @SuppressWarnings("deprecation") private void unlock() {
        if (unlocking) return;
        if (!keyguard.isDeviceSecure()) { locked = false; showUnlocked(); return; }
        Intent request = keyguard.createConfirmDeviceCredentialIntent("Unlock Circlo Admin", "Use your phone screen lock to continue.");
        if (request == null) return;
        unlockAttempted = true; unlocking = true; startActivityForResult(request, UNLOCK);
    }
    @Override protected void onResume() {
        super.onResume(); if (webView != null) webView.onResume();
        if (unlocking || picking || (exports != null && exports.isPicking())) return;
        if (lockEnabled() && backgroundAt != 0 && SystemClock.elapsedRealtime() - backgroundAt >= 60000) locked = true;
        if (locked) { showLock(); if (!unlockAttempted) unlock(); } else showUnlocked();
    }
    @Override protected void onPause() { super.onPause(); if (webView != null) webView.onPause(); if (cover != null && !pageFailed) cover.setVisibility(View.VISIBLE); }
    @Override protected void onStop() { super.onStop(); if (!unlocking && !picking && (exports == null || !exports.isPicking())) { backgroundAt = SystemClock.elapsedRealtime(); unlockAttempted = false; } }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent result) {
        super.onActivityResult(requestCode, resultCode, result);
        if (requestCode == UNLOCK) { unlocking = false; locked = resultCode != RESULT_OK; if (locked) showLock(); else showUnlocked(); }
        else if (requestCode == AdminExports.SAVE_DOCUMENT) exports.documentResult(resultCode, result);
        else if (requestCode == PICK_FILE) {
            picking = false; if (fileSelection == null) return;
            Uri[] values = WebChromeClient.FileChooserParams.parseResult(resultCode, result);
            if (values != null) for (Uri value : values) if (!"content".equals(value.getScheme())) { values = null; break; }
            fileSelection.onReceiveValue(values); fileSelection = null;
        }
    }

    private void signOut() {
        if (exports != null) exports.cancel();
        String cookies = CookieManager.getInstance().getCookie(AdminPolicy.ORIGIN);
        coverTitle.setText("Signing out…"); coverMessage.setText(""); coverAction.setVisibility(View.GONE); cover.setVisibility(View.VISIBLE);
        network.execute(() -> {
            HttpURLConnection connection = null; boolean success = false;
            try {
                connection = (HttpURLConnection) new URL(AdminPolicy.ORIGIN + "/api/auth/logout").openConnection();
                connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST"); connection.setConnectTimeout(15000); connection.setReadTimeout(15000);
                connection.setRequestProperty("Origin", AdminPolicy.ORIGIN); connection.setRequestProperty("Content-Type", "application/json");
                if (cookies != null) connection.setRequestProperty("Cookie", cookies);
                connection.setDoOutput(true); try (java.io.OutputStream output = connection.getOutputStream()) { output.write("{}".getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
                success = connection.getResponseCode() == 200;
            } catch (Exception ignored) { /* No credentials or response bodies are logged. */ }
            finally { if (connection != null) connection.disconnect(); }
            boolean finished = success;
            runOnUiThread(() -> {
                if (isDestroyed() || isFinishing()) return;
                coverAction.setVisibility(View.VISIBLE);
                if (finished) CookieManager.getInstance().removeAllCookies(removed -> { CookieManager.getInstance().flush(); webView.clearHistory(); webView.loadUrl(AdminPolicy.ORIGIN + "/login?next=%2Fapp%2Fadmin"); });
                else showError("Could not sign out. Check your connection and try again, or lock the app from the menu.");
            });
        });
    }
    private void navigate(String url) { if (!rendererGone && !locked && AdminPolicy.trusted(url)) webView.loadUrl(url); }
    private void reload() { if (!rendererGone && !locked) { pageFailed = false; cover.setVisibility(View.GONE); webView.loadUrl(AdminPolicy.trusted(webView.getUrl()) ? webView.getUrl() : AdminPolicy.HOME); } }
    private void showUnlocked() { if (pageFailed) showError(lastError); else cover.setVisibility(View.GONE); }
    private void showError(String message) { lastError = message; pageFailed = true; progress.setVisibility(View.GONE); if (locked) return; browserAction.setVisibility(View.VISIBLE); coverTitle.setText("Cannot open this page"); coverMessage.setText(message); coverAction.setText("Try again"); coverAction.setOnClickListener(v -> reload()); coverAction.setVisibility(View.VISIBLE); cover.setVisibility(View.VISIBLE); }
    private void goBack() { if (locked) finish(); else if (webView.canGoBack()) webView.goBack(); else finish(); }
    private void openBrowser(String url) { if (!AdminPolicy.externalHttps(url)) return; try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); } catch (Exception ignored) { notifyUser("No browser is available."); } }
    private Button button(String text, View.OnClickListener action) { Button button = new Button(this); button.setText(text); button.setTextColor(TEXT); button.setAllCaps(false); button.setMinHeight(dp(48)); button.setOnClickListener(action); return button; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void notifyUser(String value) { Toast.makeText(this, value, Toast.LENGTH_LONG).show(); }
    @Override protected void onDestroy() { cancelCamera(); if (fileSelection != null) fileSelection.onReceiveValue(null); if (exports != null) exports.close(); network.shutdownNow(); if (webView != null && !rendererGone) { webView.stopLoading(); webView.destroy(); } super.onDestroy(); }
}
