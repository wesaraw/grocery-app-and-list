package com.example.groceryapp

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.URLEncoder

class RuntimeBridge(private val context: Context, private val webView: WebView) {
    private val storage = StorageBridge(context)

    @JavascriptInterface
    fun sendMessage(type: String, json: String) {
        try {
            val obj = JSONObject(json)
            val cbId = obj.optString("callbackId")
            when (type) {
                "openStoreTab" -> {
                    val url = obj.optString("url")
                    val intent = Intent(context, StoreActivity::class.java).apply {
                        putExtra("url", url)
                    }
                    context.startActivity(intent)
                    respond(cbId, "{\"tabId\":0}")
                }
                "scrapedData" -> {
                    val item = obj.optString("item")
                    val store = obj.optString("store")
                    val products = obj.optJSONArray("products")
                    val key = "scraped_${URLEncoder.encode(item, "UTF-8")}_${URLEncoder.encode(store, "UTF-8")}"
                    storage.setItem(key, products?.toString())
                    respond(cbId, "{}")
                }
                else -> {
                    respond(cbId, "{}")
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun respond(id: String?, result: String) {
        if (id.isNullOrEmpty()) return
        val js = "window.__runtimeCallback(" + JSONObject.quote(id) + "," + JSONObject.quote(result) + ");"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
