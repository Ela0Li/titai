package com.studydeck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

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
 * 只做最小集合：多学习包的读写与切换、每个包独立的进度文件、一个通用 HTTP 客户端、少量杂项。
 * 全部方法都在 WebView 的 JS 线程被调用（非主线程），可以直接做阻塞 IO。
 *
 * 目录布局（filesDir 下）：
 *   decks/<id>.json    从电脑导入的学习包（内置包在 assets/decks/ 里，不在这个目录）
 *   states/<id>.json   每个学习包各自的进度，切包不互相污染
 *   state.json         旧版本的单包进度，首次启动会迁移到 states/<内置包 id>.json
 */
public class Bridge {

    /** 导入文件大小上限：2 MB，防一个畸形大包卡住 WebView */
    static final long MAX_IMPORT_BYTES = 2L * 1024 * 1024;

    private final Context ctx;
    private final Host host;

    Bridge(Context ctx, Host host) {
        this.ctx = ctx;
        this.host = host;
        migrateLegacyState();
    }

    Bridge(Context ctx) {
        this(ctx, null);
    }

    // ---------- 设备级偏好（外观、同步地址） ----------
    // 这些跟"学哪个包"无关，放包里会导致换包后主题、配对码全丢

    private File prefsFile() {
        return new File(ctx.getFilesDir(), "prefs.json");
    }

    @JavascriptInterface
    public String readPrefs() {
        File f = prefsFile();
        if (!f.exists()) return "";
        String s = readText(f);
        return s == null ? "" : s;
    }

    @JavascriptInterface
    public boolean writePrefs(String json) {
        if (json == null) return false;
        File tmp = new File(ctx.getFilesDir(), "prefs.json.tmp");
        File dst = prefsFile();
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return false;
        }
        return tmp.renameTo(dst) || dst.exists();
    }

    // ---------- 外部导入（文件选择器 / 分享 / adb） ----------

    /** 交给 Activity 去弹系统文件选择器 */
    public interface Host {
        void requestPickFile();
    }

    /** 暂存目录里的导入文件，JS 校验通过后才落进 decks/ */
    File stagedImportFile() {
        return new File(ctx.getCacheDir(), "import.deck.json");
    }

    @JavascriptInterface
    public void pickDeckFile() {
        if (host != null) host.requestPickFile();
    }

    /** 读出暂存内容（UTF-8 文本）；没有就返回空串 */
    @JavascriptInterface
    public String readStagedImport() {
        File f = stagedImportFile();
        if (!f.exists()) return "";
        return readText(f) == null ? "" : readText(f);
    }

    @JavascriptInterface
    public void dropStagedImport() {
        File f = stagedImportFile();
        if (f.exists()) f.delete();
    }

    /** 供调试/自动化：直接读一个路径并作为导入源（仅 adb 深链使用） */
    @JavascriptInterface
    public boolean readFileIntoStaging(String path) {
        try {
            File src = new File(path);
            if (!src.exists() || !src.isFile() || src.length() > MAX_IMPORT_BYTES) {
                android.util.Log.w("StudyDeck", "import: bad source " + path
                        + " exists=" + src.exists() + " file=" + src.isFile() + " len=" + src.length());
                return false;
            }
            try (InputStream in = new FileInputStream(src)) {
                boolean ok = copyToStaging(in);
                android.util.Log.i("StudyDeck", "import: staged=" + ok + " from " + path);
                return ok;
            }
        } catch (Exception e) {
            android.util.Log.w("StudyDeck", "import: read failed " + e);
            return false;
        }
    }

    boolean copyToStaging(InputStream in) {
        File dst = stagedImportFile();
        try (OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[8192];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_IMPORT_BYTES) {
                    out.close();
                    dst.delete();
                    return false;
                }
                out.write(buf, 0, n);
            }
            out.flush();
            return true;
        } catch (Exception e) {
            dst.delete();
            return false;
        }
    }

    // ---------- 内置版本号 ----------

    /** 让页面显示真实安装版本，而不是写死的字符串 */
    @JavascriptInterface
    public String versionName() {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- 目录 ----------

    private File decksDir() {
        File d = new File(ctx.getFilesDir(), "decks");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private File statesDir() {
        File d = new File(ctx.getFilesDir(), "states");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeName(String id) {
        return String.valueOf(id).replaceAll("[^A-Za-z0-9_\\-]", "_");
    }

    private File stateFileFor(String deckId) {
        return new File(statesDir(), safeName(deckId) + ".json");
    }

    private File deckFileFor(String deckId) {
        return new File(decksDir(), safeName(deckId) + ".json");
    }

    private SharedPreferences prefs() {
        return ctx.getSharedPreferences("titai", Context.MODE_PRIVATE);
    }

    /** 旧版本只有一个 state.json：第一次跑新版时把它归到内置包名下，用户不会丢进度 */
    private void migrateLegacyState() {
        File legacy = new File(ctx.getFilesDir(), "state.json");
        if (!legacy.exists()) return;
        String builtin = builtinDeckId();
        if (builtin == null) return;
        File target = stateFileFor(builtin);
        if (!target.exists()) {
            if (legacy.renameTo(target)) return;
            try {
                copyFile(legacy, target);
                legacy.delete();
            } catch (Exception ignored) {
            }
        } else {
            legacy.delete();
        }
    }

    /** assets/decks 里第一个包的 id，用作默认包 */
    private String builtinDeckId() {
        try {
            String[] names = ctx.getAssets().list("decks");
            if (names == null) return null;
            java.util.Arrays.sort(names);
            for (String n : names) {
                if (n.endsWith(".json")) return n.substring(0, n.length() - 5);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String readAssetText(String name) {
        try (InputStream in = ctx.getAssets().open(name)) {
            return readAll(in);
        } catch (Exception e) {
            return "";
        }
    }

    // ---------- 学习包 ----------

    /**
     * 所有可用学习包的摘要（内置 + 导入）。
     * @return JSON 数组：[{id,title,checks,qas,bytes,builtin}]
     */
    @JavascriptInterface
    public String listDecks() {
        JSONArray out = new JSONArray();
        java.util.LinkedHashMap<String, JSONObject> byId = new java.util.LinkedHashMap<>();

        // 内置（assets/decks/*.json）
        try {
            String[] names = ctx.getAssets().list("decks");
            if (names != null) {
                java.util.Arrays.sort(names);
                for (String n : names) {
                    if (!n.endsWith(".json")) continue;
                    JSONObject o = summarize(readAssetText("decks/" + n), true);
                    if (o != null) byId.put(o.optString("id"), o);
                }
            }
        } catch (Exception ignored) {
        }

        // 导入（files/decks/*.json）覆盖同 id 的内置包
        File[] files = decksDir().listFiles();
        if (files != null) {
            java.util.Arrays.sort(files);
            for (File f : files) {
                if (!f.getName().endsWith(".json")) continue;
                JSONObject o = summarize(readText(f), false);
                if (o != null) byId.put(o.optString("id"), o);
            }
        }

        for (JSONObject o : byId.values()) out.put(o);
        return out.toString();
    }

    private JSONObject summarize(String json, boolean builtin) {
        if (json == null || json.isEmpty()) return null;
        try {
            JSONObject d = new JSONObject(json);
            int checks = 0;
            JSONArray groups = d.optJSONArray("groups");
            if (groups != null) {
                for (int i = 0; i < groups.length(); i++) {
                    JSONArray cs = groups.optJSONObject(i).optJSONArray("checks");
                    if (cs != null) checks += cs.length();
                }
            }
            JSONObject o = new JSONObject();
            o.put("id", d.optString("id", ""));
            o.put("title", d.optString("title", "未命名学习包"));
            o.put("checks", checks);
            o.put("qas", d.optJSONArray("qas") == null ? 0 : d.optJSONArray("qas").length());
            o.put("builtin", builtin);
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    /** 读出某个学习包的完整 JSON；先找导入目录，再找 assets */
    @JavascriptInterface
    public String readDeck(String deckId) {
        if (deckId == null || deckId.isEmpty()) return "";
        File f = deckFileFor(deckId);
        if (f.exists()) {
            String s = readText(f);
            if (s != null && !s.isEmpty()) return s;
        }
        return readAssetText("decks/" + safeName(deckId) + ".json");
    }

    /** 保存一份导入的学习包（页面从电脑下载后调用），返回它的 id */
    @JavascriptInterface
    public String saveDeck(String json) {
        JSONObject o = summarize(json, false);
        if (o == null) return "";
        String id = o.optString("id", "");
        if (id.isEmpty()) return "";
        File tmp = new File(decksDir(), safeName(id) + ".tmp");
        File dst = deckFileFor(id);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return "";
        }
        return tmp.renameTo(dst) ? id : "";
    }

    /** 只能删导入的包；内置包删不掉 */
    @JavascriptInterface
    public boolean deleteDeck(String deckId) {
        File f = deckFileFor(deckId);
        return !f.exists() || f.delete();
    }

    @JavascriptInterface
    public String currentDeck() {
        String id = prefs().getString("deck", "");
        if (id == null || id.isEmpty()) {
            String b = builtinDeckId();
            return b == null ? "" : b;
        }
        return id;
    }

    @JavascriptInterface
    public void setCurrentDeck(String deckId) {
        prefs().edit().putString("deck", deckId == null ? "" : deckId).apply();
    }

    // ---------- 进度（按学习包隔离） ----------

    @JavascriptInterface
    public String readState(String deckId) {
        File f = stateFileFor(deckId);
        if (!f.exists()) return "";
        return readText(f);
    }

    @JavascriptInterface
    public boolean writeState(String deckId, String json) {
        if (json == null) return false;
        File tmp = new File(statesDir(), safeName(deckId) + ".tmp");
        File dst = stateFileFor(deckId);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return false;
        }
        return tmp.renameTo(dst);
    }

    @JavascriptInterface
    public boolean clearState(String deckId) {
        File f = stateFileFor(deckId);
        return !f.exists() || f.delete();
    }

    @JavascriptInterface
    public String statePath(String deckId) {
        return stateFileFor(deckId).getAbsolutePath();
    }

    // 兼容旧页面（没有多包概念时调用的四个方法）
    @JavascriptInterface
    public String loadState() {
        return readState(currentDeck());
    }

    @JavascriptInterface
    public boolean saveState(String json) {
        return writeState(currentDeck(), json);
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
                + ",\"app\":\"0.2.0\""
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
    public void toast(final String msg) {
        final Context c = ctx;
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

    private String readText(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            return readAll(in);
        } catch (Exception e) {
            return "";
        }
    }

    private static void copyFile(File from, File to) throws Exception {
        try (FileInputStream in = new FileInputStream(from);
             FileOutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.getFD().sync();
        }
    }

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
