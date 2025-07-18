package com.example.groceryapp

import android.content.Context
import android.content.SharedPreferences
import android.webkit.JavascriptInterface

class StorageBridge(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("web_storage", Context.MODE_PRIVATE)

    private fun isRuntimeKey(key: String): Boolean {
        return key == "currentItemInfo" || key.startsWith("scraped_")
    }

    @JavascriptInterface
    fun getItem(key: String): String? {
        return if (isRuntimeKey(key)) {
            RuntimeBridge.getRuntimeItem(key)
        } else {
            prefs.getString(key, null)
        }
    }

    @JavascriptInterface
    fun setItem(key: String, value: String?) {
        if (isRuntimeKey(key)) {
            RuntimeBridge.setRuntimeItem(key, value)
        } else {
            prefs.edit().apply {
                if (value == null) remove(key) else putString(key, value)
            }.apply()
        }
    }
}
