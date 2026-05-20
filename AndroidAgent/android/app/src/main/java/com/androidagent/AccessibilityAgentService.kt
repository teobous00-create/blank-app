package com.androidagent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.ReactApplicationContext

class AccessibilityAgentService : AccessibilityService() {

    companion object {
        private const val TAG = "AccessibilityAgent"
        var instance: AccessibilityAgentService? = null

        fun isRunning() = instance != null

        fun performTapByText(text: String): Boolean {
            return instance?.findAndTap(text) ?: false
        }

        fun performTypeText(nodeText: String, value: String): Boolean {
            return instance?.typeText(nodeText, value) ?: false
        }

        fun performTapCoordinates(x: Float, y: Float): Boolean {
            return instance?.tapCoordinates(x, y) ?: false
        }

        fun performScrollDown(): Boolean {
            return instance?.scrollDown() ?: false
        }

        fun performScrollUp(): Boolean {
            return instance?.scrollUp() ?: false
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No-op: we use this service for actions, not event monitoring
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "Accessibility service destroyed")
    }

    fun findAndTap(text: String): Boolean {
        val root = rootInActiveWindow ?: run {
            Log.w(TAG, "findAndTap: no active window")
            return false
        }

        val node = findNodeByText(root, text) ?: run {
            Log.w(TAG, "findAndTap: node not found for text='$text'")
            root.recycle()
            return false
        }

        val result = clickNode(node)
        node.recycle()
        root.recycle()
        return result
    }

    fun typeText(nodeText: String, value: String): Boolean {
        val root = rootInActiveWindow ?: run {
            Log.w(TAG, "typeText: no active window")
            return false
        }

        val node = findNodeByText(root, nodeText)
            ?: findEditableNode(root)
            ?: run {
                Log.w(TAG, "typeText: editable node not found")
                root.recycle()
                return false
            }

        // Focus the field first
        node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

        val args = Bundle()
        args.putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        val result = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)

        node.recycle()
        root.recycle()
        return result
    }

    fun tapCoordinates(x: Float, y: Float): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val strokeDescription = GestureDescription.StrokeDescription(path, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(strokeDescription).build()

        var result = false
        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription) {
                result = true
                Log.d(TAG, "Tap gesture completed at ($x, $y)")
            }
            override fun onCancelled(gestureDescription: GestureDescription) {
                Log.w(TAG, "Tap gesture cancelled at ($x, $y)")
            }
        }, null)

        // Give the gesture time to dispatch
        Thread.sleep(200)
        return true
    }

    fun scrollDown(): Boolean {
        return performScroll(downward = true)
    }

    fun scrollUp(): Boolean {
        return performScroll(downward = false)
    }

    private fun performScroll(downward: Boolean): Boolean {
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels.toFloat()
        val screenHeight = displayMetrics.heightPixels.toFloat()

        val startX = screenWidth / 2
        val startY = if (downward) screenHeight * 0.7f else screenHeight * 0.3f
        val endY = if (downward) screenHeight * 0.3f else screenHeight * 0.7f

        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(startX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 300)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()

        dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription) {
                Log.d(TAG, "Scroll ${if (downward) "down" else "up"} completed")
            }
        }, null)

        Thread.sleep(400)
        return true
    }

    // --- Node traversal helpers ---

    private fun findNodeByText(root: AccessibilityNodeInfo, text: String): AccessibilityNodeInfo? {
        // Try exact content description match
        val byDesc = root.findAccessibilityNodeInfosByText(text)
        if (byDesc.isNotEmpty()) return byDesc[0]

        // Try case-insensitive traversal
        return traverseForText(root, text.lowercase())
    }

    private fun traverseForText(node: AccessibilityNodeInfo, lowerText: String): AccessibilityNodeInfo? {
        val nodeText = node.text?.toString()?.lowercase()
        val contentDesc = node.contentDescription?.toString()?.lowercase()
        val viewId = node.viewIdResourceName?.lowercase()

        if (nodeText?.contains(lowerText) == true ||
            contentDesc?.contains(lowerText) == true ||
            viewId?.contains(lowerText) == true) {
            return AccessibilityNodeInfo.obtain(node)
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = traverseForText(child, lowerText)
            child.recycle()
            if (found != null) return found
        }
        return null
    }

    private fun findEditableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (root.isEditable) return AccessibilityNodeInfo.obtain(root)
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val found = findEditableNode(child)
            child.recycle()
            if (found != null) return found
        }
        return null
    }

    private fun clickNode(node: AccessibilityNodeInfo): Boolean {
        if (node.isClickable) {
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }

        // Walk up to find a clickable parent
        var parent = node.parent
        while (parent != null) {
            if (parent.isClickable) {
                val result = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                parent.recycle()
                return result
            }
            val next = parent.parent
            parent.recycle()
            parent = next
        }

        // Fall back to coordinate tap using the node's bounds
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        if (!bounds.isEmpty) {
            val cx = ((bounds.left + bounds.right) / 2).toFloat()
            val cy = ((bounds.top + bounds.bottom) / 2).toFloat()
            return tapCoordinates(cx, cy)
        }

        return false
    }
}
