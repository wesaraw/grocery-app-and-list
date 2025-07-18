package com.example.groceryapp

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class StoreActivity : AppCompatActivity() {
    private var tabId: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RuntimeBridge.loadState(this)
        setContentView(R.layout.activity_store)

        val url = intent.getStringExtra("url") ?: ""
        tabId = intent.getIntExtra("tabId", 0)

        val webView: WebView = findViewById(R.id.webview)
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.allowFileAccessFromFileURLs = true

        webView.addJavascriptInterface(StorageBridge(this), "StorageBridge")
        webView.addJavascriptInterface(RuntimeBridge(this), "RuntimeBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                injectScripts(view)
            }
        }

        RuntimeBridge.registerTab(tabId, webView)
        webView.loadUrl(url)
    }

    private fun injectScripts(view: WebView?) {
        if (view == null) return
        assets.open("bridge.js").bufferedReader().use {
            view.evaluateJavascript(it.readText(), null)
        }
        assets.open("contentScript.js").bufferedReader().use {
            view.evaluateJavascript(it.readText(), null)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        RuntimeBridge.unregisterTab(tabId)
    }

    override fun onStop() {
        super.onStop()
        RuntimeBridge.saveState(this)
    }
}
