package com.example.groceryapp

import android.content.Context
import android.content.SharedPreferences
import android.webkit.JavascriptInterface

class StorageBridge(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("web_storage", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun getItem(key: String): String? = prefs.getString(key, null)

    @JavascriptInterface
    fun setItem(key: String, value: String?) {
        prefs.edit().apply {
            if (value == null) remove(key) else putString(key, value)
        }.apply()
    }
}
