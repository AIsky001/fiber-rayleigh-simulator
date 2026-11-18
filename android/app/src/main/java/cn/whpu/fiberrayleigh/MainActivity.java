package cn.whpu.fiberrayleigh;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** 武汉职业技术大学光纤仿真安卓端。作者：池行强。 */
public final class MainActivity extends Activity {
    private static final String LOCAL_HOST = "fiber.local";
    private static final String START_URL = "https://fiber.local/";
    private static final int REQUEST_OPEN_PROJECT = 821;
    private static final int REQUEST_SAVE_FILE = 822;
    private static final int MAX_FILE_BYTES = 1024 * 1024;
    private static final Set<String> ASSETS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "fiber-rayleigh-simulator.html", "project.js", "app-controls.js",
            "qrcode-generator.js", "lucide.min.js")));

    private WebView webView;
    private ValueCallback<Uri[]> fileChooser;
    private byte[] pendingFile;
    private String pendingMime;
    private String pendingFilename;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(22, 122, 104));
        window.setNavigationBarColor(Color.rgb(233, 239, 235));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(242, 245, 242));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        // ACTION_OPEN_DOCUMENT returns content:// URIs for the selected project JSON.
        settings.setAllowContentAccess(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new AndroidBridge(), "FiberAndroid");
        webView.setWebViewClient(new LocalAssetsClient());
        webView.setWebChromeClient(new FilePickerChromeClient());
        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        webView.loadUrl(START_URL);
    }

    private WebResourceResponse response(int status, String reason, String mime, InputStream stream) {
        return new WebResourceResponse(mime, "UTF-8", status, reason,
                Collections.singletonMap("X-Content-Type-Options", "nosniff"), stream);
    }

    private final class LocalAssetsClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!LOCAL_HOST.equals(uri.getHost()) || !"https".equals(uri.getScheme()) || !"GET".equals(request.getMethod())) {
                return response(403, "Forbidden", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
            String path = uri.getPath();
            String asset = "/".equals(path) || "/index.html".equals(path)
                    ? "fiber-rayleigh-simulator.html"
                    : path != null && path.startsWith("/") ? path.substring(1) : "";
            if (!ASSETS.contains(asset)) {
                return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
            String mime = asset.endsWith(".html") ? "text/html" : "text/javascript";
            try {
                return response(200, "OK", mime, getAssets().open(asset));
            } catch (IOException error) {
                return response(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !LOCAL_HOST.equals(uri.getHost()) || !"https".equals(uri.getScheme());
        }
    }

    private final class AndroidBridge {
        private final SharedPreferences preferences = getSharedPreferences("fiber-login", MODE_PRIVATE);

        @JavascriptInterface
        public boolean isAuthenticated() {
            return preferences.getBoolean("authenticated", false);
        }

        @JavascriptInterface
        public boolean login(String username, String password) {
            boolean accepted = "admin".equals(username) && "admin".equals(password);
            if (accepted) preferences.edit().putBoolean("authenticated", true).apply();
            return accepted;
        }

        @JavascriptInterface
        public void logout() {
            preferences.edit().putBoolean("authenticated", false).apply();
        }

        @JavascriptInterface
        public boolean saveFile(String filename, String mime, String base64) {
            if (pendingFile != null || base64 == null || base64.length() > MAX_FILE_BYTES * 2) return false;
            try {
                pendingFile = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                if (pendingFile.length > MAX_FILE_BYTES) { pendingFile = null; return false; }
                pendingMime = "text/csv".equals(mime) ? "text/csv" : "application/json";
                pendingFilename = filename != null && !filename.trim().isEmpty() && filename.length() <= 120
                        ? filename.replace('/', '_').replace('\\', '_')
                        : "text/csv".equals(pendingMime) ? "fiber-rayleigh-export.csv" : "fiber-rayleigh-project.json";
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(pendingMime);
                    intent.putExtra(Intent.EXTRA_TITLE, pendingFilename);
                    try { startActivityForResult(intent, REQUEST_SAVE_FILE); }
                    catch (ActivityNotFoundException error) {
                        pendingFile = null;
                        notifyPage("fiber:file-save-error", "系统文件选择器不可用");
                    }
                });
                return true;
            } catch (IllegalArgumentException error) {
                pendingFile = null;
                return false;
            }
        }
    }

    private final class FilePickerChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileChooser != null) fileChooser.onReceiveValue(null);
            fileChooser = callback;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            try {
                startActivityForResult(intent, REQUEST_OPEN_PROJECT);
                return true;
            } catch (ActivityNotFoundException error) {
                fileChooser = null;
                callback.onReceiveValue(null);
                return false;
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_OPEN_PROJECT) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (fileChooser != null) {
                fileChooser.onReceiveValue(uri == null ? null : new Uri[]{uri});
                fileChooser = null;
            }
        } else if (requestCode == REQUEST_SAVE_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingFile != null) {
                writeFile(data.getData(), pendingFile, pendingFilename);
            } else {
                notifyPage("fiber:file-save-cancelled", "已取消文件保存");
            }
            pendingFile = null;
            pendingFilename = null;
            pendingMime = null;
        }
    }

    private void writeFile(Uri uri, byte[] bytes, String name) {
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IOException("无法打开所选文件。");
            output.write(bytes);
            notifyPage("fiber:file-saved", name);
        } catch (IOException error) {
            notifyPage("fiber:file-save-error", "保存失败，请检查存储位置后重试");
        }
    }

    private void notifyPage(String event, String message) {
        if (webView == null) return;
        String script = "document.dispatchEvent(new CustomEvent(" + JSONObject.quote(event)
                + ",{detail:{name:" + JSONObject.quote(message)
                + ",text:" + JSONObject.quote(message) + "}}))";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileChooser != null) fileChooser.onReceiveValue(null);
        if (webView != null) {
            webView.removeJavascriptInterface("FiberAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
