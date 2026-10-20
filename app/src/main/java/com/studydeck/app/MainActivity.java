package com.studydeck.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.InputStream;

/**
 * 题台：一个通用 WebView 壳。
 * 内容与逻辑全在 assets/ 里，Java 只负责四件事：
 * 1. 提供一个全屏 WebView（竖屏、无滚动条）；
 * 2. 通过 @JavascriptInterface 暴露持久化、HTTP（局域网同步）、外部导入；
 * 3. 把返回键交给网页处理；
 * 4. 接收外部文件（系统文件选择器 / 分享 / adb），落到缓存等页面校验。
 */
public class MainActivity extends Activity implements Bridge.Host {

    private static final String TAG = "StudyDeck";
    private static final int REQ_IMPORT = 41;

    private WebView web;
    private Bridge bridge;
    private boolean pageReady = false;
    private boolean pendingImport = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.setStatusBarColor(Color.parseColor("#0d1117"));
            w.setNavigationBarColor(Color.parseColor("#0d1117"));
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#0d1117"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingImport) {
                    pendingImport = false;
                    dispatchImport();
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.i(TAG, cm.message() + " @" + cm.lineNumber());
                return true;
            }
        });

        bridge = new Bridge(this, this);
        web.addJavascriptInterface(bridge, "Native");
        setContentView(web);
        web.loadUrl(startUrl(getIntent()));
        handleExternalImport(getIntent());
    }

    /** 支持从 adb/外部唤起指定页面：am start -e open q.m1.types / -e check m1.1 / -e tab qa */
    private String startUrl(android.content.Intent it) {
        String base = "file:///android_asset/index.html";
        if (it == null) return base;
        StringBuilder q = new StringBuilder();
        String[] keys = { "tab", "open", "check", "host", "code", "sync", "deck", "download", "decks",
                "importFile", "pick" };
        for (String k : keys) {
            String v = it.getStringExtra(k);
            if (v != null && v.length() > 0) {
                if (q.length() > 0) q.append('&');
                q.append(k).append('=').append(android.net.Uri.encode(v));
            }
        }
        return q.length() == 0 ? base : base + "?" + q;
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        if (web == null) return;
        if (intent != null && intent.hasExtra("tab")) {
            web.loadUrl(startUrl(intent));
        }
        handleExternalImport(intent);
    }

    // ---------- 外部导入：系统选择器 / 分享 / adb ----------

    @Override
    public void requestPickFile() {
        runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            // 不按 MIME 过滤：各家文件管理器给 .json 贴的 type 五花八门
            // （application/json、octet-stream、甚至 text/plain），内容由 JS 端体检兜底
            i.setType("*/*");
            try {
                startActivityForResult(i, REQ_IMPORT);
            } catch (Exception e) {
                Toast.makeText(this, "这台设备没有可用的文件选择器", Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_IMPORT && resultCode == RESULT_OK && data != null) {
            Uri u = data.getData();
            if (u != null) stageFromUri(u);
        }
    }

    /** adb 深链 / 分享进来的文件：先落到缓存，再交给网页校验 */
    private void handleExternalImport(Intent it) {
        if (it == null) return;
        String path = it.getStringExtra("importFile");
        if (path != null && !path.isEmpty()) {
            if (bridge.readFileIntoStaging(path)) requestImport();
            else Toast.makeText(this, "读不到这个文件（或超过 2 MB）", Toast.LENGTH_LONG).show();
            return;
        }
        Uri u = it.getData();
        if (u == null && it.hasExtra(Intent.EXTRA_STREAM)) {
            u = it.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (u != null) stageFromUri(u);
    }

    private void stageFromUri(final Uri uri) {
        new Thread(() -> {
            boolean ok = false;
            // 个别机型的文件管理器会回 file:// 而不是 content://，ContentResolver 不认这种
            if ("file".equals(uri.getScheme())) {
                try (InputStream in = new java.io.FileInputStream(new java.io.File(uri.getPath()))) {
                    ok = bridge.copyToStaging(in);
                } catch (Exception e) {
                    Log.w(TAG, "import read failed (file uri): " + e);
                }
            } else {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in != null) ok = bridge.copyToStaging(in);
                } catch (Exception e) {
                    Log.w(TAG, "import read failed: " + e);
                }
            }
            final boolean done = ok;
            runOnUiThread(() -> {
                if (!done) {
                    Toast.makeText(this, "文件读不进来（或超过 2 MB）", Toast.LENGTH_LONG).show();
                    return;
                }
                requestImport();
            });
        }).start();
    }

    private void requestImport() {
        if (!pageReady) {
            pendingImport = true;
            return;
        }
        dispatchImport();
    }

    private void dispatchImport() {
        if (web == null) return;
        web.evaluateJavascript("window.__importStaged && window.__importStaged()", null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return String(!!(window.__back&&window.__back()));}catch(e){return 'false';}})()",
                value -> {
                    // evaluateJavascript 返回的是 JSON 编码值：字符串会带引号
                    boolean handled = value != null && value.contains("true");
                    if (!handled) {
                        MainActivity.super.onBackPressed();
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
