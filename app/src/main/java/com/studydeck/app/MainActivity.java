package com.studydeck.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
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

/**
 * 题台：一个通用 WebView 壳。
 * 内容与逻辑全在 assets/ 里，Java 只负责三件事：
 * 1. 提供一个全屏 WebView（竖屏、无滚动条）；
 * 2. 通过 @JavascriptInterface 暴露持久化与 HTTP（局域网同步）；
 * 3. 把返回键交给网页处理。
 */
public class MainActivity extends Activity {

    private static final String TAG = "StudyDeck";
    private WebView web;

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

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.i(TAG, cm.message() + " @" + cm.lineNumber());
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(this), "Native");
        setContentView(web);
        web.loadUrl(startUrl(getIntent()));
    }

    /** 支持从 adb/外部唤起指定页面：am start -e open q.m1.types / -e check m1.1 / -e tab qa */
    private String startUrl(android.content.Intent it) {
        String base = "file:///android_asset/index.html";
        if (it == null) return base;
        StringBuilder q = new StringBuilder();
        String[] keys = { "tab", "open", "check", "host", "code", "sync" };
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
        if (web != null) web.loadUrl(startUrl(intent));
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
