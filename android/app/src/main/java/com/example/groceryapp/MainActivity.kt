package com.example.groceryapp

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

import com.example.groceryapp.StorageBridge
import com.example.groceryapp.RuntimeBridge

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RuntimeBridge.loadState(this)
        setContentView(R.layout.activity_main)

        val webView: WebView = findViewById(R.id.webview)
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.allowFileAccessFromFileURLs = true

        webView.addJavascriptInterface(StorageBridge(this), "StorageBridge")
        webView.addJavascriptInterface(RuntimeBridge(this), "RuntimeBridge")

        webView.loadUrl("file:///android_asset/launcher.html")
    }

    override fun onStop() {
        super.onStop()
        RuntimeBridge.saveState(this)
    }
}
