package com.example.groceryapp

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.URLEncoder

class RuntimeBridge(private val context: Context) {
    companion object {
        private val tabMap = mutableMapOf<Int, WebView>()
        private var nextId = 1

        private val runtimeData = mutableMapOf<String, String?>()
        private var loaded = false

        fun getRuntimeItem(key: String): String? = runtimeData[key]

        fun setRuntimeItem(key: String, value: String?) {
            if (value == null) runtimeData.remove(key) else runtimeData[key] = value
        }

        fun loadState(context: Context) {
            if (loaded) return
            val prefs = context.getSharedPreferences("web_storage", Context.MODE_PRIVATE)
            val json = prefs.getString("__runtimeState__", null)
            if (json != null) {
                try {
                    val obj = JSONObject(json)
                    for (key in obj.keys()) {
                        runtimeData[key] = obj.getString(key)
                    }
                } catch (_: Exception) {}
            }
            loaded = true
        }

        fun saveState(context: Context) {
            val prefs = context.getSharedPreferences("web_storage", Context.MODE_PRIVATE)
            val obj = JSONObject()
            for ((k, v) in runtimeData) {
                obj.put(k, v)
            }
            prefs.edit().putString("__runtimeState__", obj.toString()).apply()
        }

        fun registerTab(tabId: Int, webView: WebView) {
            tabMap[tabId] = webView
        }

        fun unregisterTab(tabId: Int) {
            tabMap.remove(tabId)
        }

        fun sendToTab(tabId: Int, message: String) {
            val webView = tabMap[tabId] ?: return
            try {
                val obj = JSONObject(message)
                if (obj.optString("type") == "triggerScrape") {
                    // Re-inject the content script whenever the UI explicitly
                    // requests a scrape to ensure the page has the scraper
                    // loaded. This mirrors the initial injection performed
                    // after page load.
                    webView.context.assets.open("contentScript.js").bufferedReader().use {
                        val script = it.readText()
                        webView.post { webView.evaluateJavascript(script, null) }
                    }
                }
            } catch (_: Exception) {
                // ignore malformed message
            }

            val js = "window.__handleNativeMessage(" + JSONObject.quote(message) + ");"
            webView.post { webView.evaluateJavascript(js, null) }
        }
    }

    @JavascriptInterface
    fun sendMessage(json: String): String? {
        val obj = JSONObject(json)
        return when (obj.optString("type")) {
            "openStoreTab" -> {
                val url = obj.getString("url")
                val item = obj.optString("item")
                val store = obj.optString("store")
                val id = nextId++
                val info = JSONObject().put("item", item).put("store", store).put("tabId", id)
                setRuntimeItem("currentItemInfo", info.toString())
                val intent = Intent(context, StoreActivity::class.java).apply {
                    putExtra("url", url)
                    putExtra("tabId", id)
                    putExtra("item", item)
                    putExtra("store", store)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                JSONObject().put("tabId", id).toString()
            }
            "scrapedData" -> {
                val item = obj.getString("item")
                val store = obj.getString("store")
                val key = "scraped_" +
                    URLEncoder.encode(item, "UTF-8") + "_" +
                    URLEncoder.encode(store, "UTF-8")
                setRuntimeItem(key, obj.getJSONArray("products").toString())
                null
            }
            else -> null
        }
    }

    @JavascriptInterface
    fun tabsSendMessage(tabId: Int, json: String) {
        sendToTab(tabId, json)
    }

    @JavascriptInterface
    fun createWindow(url: String): Int {
        val id = nextId++
        val intent = Intent(context, StoreActivity::class.java).apply {
            putExtra("url", url)
            putExtra("tabId", id)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return id
    }
}
