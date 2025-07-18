package com.example.groceryapp

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

class StoreActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_store)

        val webView: WebView = findViewById(R.id.webview)
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true

        webView.addJavascriptInterface(StorageBridge(this), "StorageBridge")
        webView.addJavascriptInterface(RuntimeBridge(this, webView), "RuntimeBridge")

        val url = intent.getStringExtra("url") ?: ""
        if (url.isNotEmpty()) {
            webView.loadUrl(url)
        }
    }
}
