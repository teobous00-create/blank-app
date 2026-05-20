package com.androidagent

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = AccessibilityBridgeModule.NAME)
class AccessibilityBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "AccessibilityBridgeModule"
    }

    override fun getName() = NAME

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(AccessibilityAgentService.isRunning())
    }

    @ReactMethod
    fun tapByText(text: String, promise: Promise) {
        if (!AccessibilityAgentService.isRunning()) {
            promise.reject("SERVICE_NOT_RUNNING", "Accessibility service is not enabled")
            return
        }
        val result = AccessibilityAgentService.performTapByText(text)
        promise.resolve(result)
    }

    @ReactMethod
    fun typeText(nodeText: String, value: String, promise: Promise) {
        if (!AccessibilityAgentService.isRunning()) {
            promise.reject("SERVICE_NOT_RUNNING", "Accessibility service is not enabled")
            return
        }
        val result = AccessibilityAgentService.performTypeText(nodeText, value)
        promise.resolve(result)
    }

    @ReactMethod
    fun tapCoordinates(x: Double, y: Double, promise: Promise) {
        if (!AccessibilityAgentService.isRunning()) {
            promise.reject("SERVICE_NOT_RUNNING", "Accessibility service is not enabled")
            return
        }
        val result = AccessibilityAgentService.performTapCoordinates(x.toFloat(), y.toFloat())
        promise.resolve(result)
    }

    @ReactMethod
    fun scrollDown(promise: Promise) {
        if (!AccessibilityAgentService.isRunning()) {
            promise.reject("SERVICE_NOT_RUNNING", "Accessibility service is not enabled")
            return
        }
        val result = AccessibilityAgentService.performScrollDown()
        promise.resolve(result)
    }

    @ReactMethod
    fun scrollUp(promise: Promise) {
        if (!AccessibilityAgentService.isRunning()) {
            promise.reject("SERVICE_NOT_RUNNING", "Accessibility service is not enabled")
            return
        }
        val result = AccessibilityAgentService.performScrollUp()
        promise.resolve(result)
    }
}
