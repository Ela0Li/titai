package com.studydeck.app;

import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 网页与原生之间的桥。
 * 只做最小集合：读/写进度文件、一个通用 HTTP 客户端（局域网同步用）、少量杂项。
 * 全部方法都在 WebView 的 JS 线程被调用（非主线程），可以直接做阻塞 IO。
 */
public class Bridge {

    private final Context ctx;

    Bridge(Context ctx) {
        this.ctx = ctx;
    }

    // ---------- 进度持久化 ----------

    /** 让页面显示真实安装版本，而不是写死的字符串 */
    @JavascriptInterface
    public String versionName() {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    private File stateFile() {
        return new File(ctx.getFilesDir(), "state.json");
    }

    @JavascriptInterface
    public String loadState() {
        File f = stateFile();
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            return readAll(in);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean saveState(String json) {
        if (json == null) return false;
        File dir = ctx.getFilesDir();
        File tmp = new File(dir, "state.tmp");
        File dst = stateFile();
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return false;
        }
        return tmp.renameTo(dst);
    }

    @JavascriptInterface
    public boolean clearState() {
        File f = stateFile();
        return !f.exists() || f.delete();
    }

    @JavascriptInterface
    public String statePath() {
        return stateFile().getAbsolutePath();
    }

    // ---------- 通用 HTTP（同步用） ----------

    /**
     * @return {"status":200,"body":"..."} 或 {"status":0,"error":"..."}
     */
    @JavascriptInterface
    public String http(String method, String url, String body, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(url);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod(method == null ? "GET" : method.toUpperCase());
            conn.setConnectTimeout(timeoutMs <= 0 ? 4000 : timeoutMs);
            conn.setReadTimeout(timeoutMs <= 0 ? 8000 : timeoutMs);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            if (body != null && !body.isEmpty()) {
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = in == null ? "" : readAll(in);
            return "{\"status\":" + code + ",\"body\":" + quote(text) + "}";
        } catch (Exception e) {
            return "{\"status\":0,\"error\":" + quote(String.valueOf(e)) + "}";
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    // ---------- 杂项 ----------

    @JavascriptInterface
    public String deviceInfo() {
        return "{\"sdk\":" + android.os.Build.VERSION.SDK_INT
                + ",\"model\":" + quote(android.os.Build.MODEL)
                + ",\"app\":\"0.1.0\""
                + ",\"files\":" + quote(ctx.getFilesDir().getAbsolutePath()) + "}";
    }

    /** 让系统状态栏/导航栏跟随网页主题，避免浅色主题下顶栏仍是黑的 */
    @JavascriptInterface
    public void setChrome(String mode) {
        if (!(ctx instanceof android.app.Activity)) return;
        final android.app.Activity act = (android.app.Activity) ctx;
        final boolean light = "light".equals(mode);
        act.runOnUiThread(() -> {
            android.view.Window w = act.getWindow();
            int bg = android.graphics.Color.parseColor(light ? "#f6f8fa" : "#0d1117");
            w.setStatusBarColor(bg);
            w.setNavigationBarColor(bg);
            android.view.View decor = w.getDecorView();
            int flags = decor.getSystemUiVisibility();
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                else flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                else flags &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            decor.setSystemUiVisibility(flags);
        });
    }

    @JavascriptInterface
    public void toast(final String msg) {        final Context c = ctx;
        if (c instanceof android.app.Activity) {
            ((android.app.Activity) c).runOnUiThread(() ->
                    Toast.makeText(c, msg, Toast.LENGTH_SHORT).show());
        }
    }

    @JavascriptInterface
    public void exitApp() {
        if (ctx instanceof android.app.Activity) {
            ((android.app.Activity) ctx).finish();
        }
    }

    // ---------- 工具 ----------

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }
}
