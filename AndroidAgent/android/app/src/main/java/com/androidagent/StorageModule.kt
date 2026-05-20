package com.androidagent

import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = StorageModule.NAME)
class StorageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "StorageModule"
        private const val PREFS_NAME = "AgentStorage"
    }

    override fun getName() = NAME

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        val value = reactApplicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(key, null)
        promise.resolve(value)
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        reactApplicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(key, value).apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        reactApplicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().remove(key).apply()
        promise.resolve(null)
    }
}
