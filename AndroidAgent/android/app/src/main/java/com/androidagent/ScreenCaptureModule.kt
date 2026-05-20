package com.androidagent

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

@ReactModule(name = ScreenCaptureModule.NAME)
class ScreenCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ScreenCaptureModule"
        private const val TAG = "ScreenCapture"
        private const val CAPTURE_REQUEST_CODE = 1001
        private const val MAX_WIDTH = 1080
        private const val JPEG_QUALITY = 85
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null
    private var pendingPermissionPromise: Promise? = null
    private var screenWidth = 0
    private var screenHeight = 0
    private var screenDensity = 0

    override fun getName() = NAME

    private val activityListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == CAPTURE_REQUEST_CODE) {
                val promise = pendingPermissionPromise ?: return
                pendingPermissionPromise = null
                if (resultCode == Activity.RESULT_OK && data != null) {
                    val projectionManager = reactContext.getSystemService(
                        Context.MEDIA_PROJECTION_SERVICE
                    ) as MediaProjectionManager
                    mediaProjection = projectionManager.getMediaProjection(resultCode, data)
                    promise.resolve(true)
                } else {
                    promise.reject("PERMISSION_DENIED", "Screen capture permission denied")
                }
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityListener)
        val metrics = reactContext.resources.displayMetrics
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels
        screenDensity = metrics.densityDpi
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        val activity = currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }
        val projectionManager = reactContext.getSystemService(
            Context.MEDIA_PROJECTION_SERVICE
        ) as MediaProjectionManager
        pendingPermissionPromise = promise
        activity.startActivityForResult(
            projectionManager.createScreenCaptureIntent(),
            CAPTURE_REQUEST_CODE
        )
    }

    @ReactMethod
    fun captureScreen(promise: Promise) {
        val projection = mediaProjection ?: run {
            promise.reject("NO_PROJECTION", "Call requestPermission first")
            return
        }

        try {
            val targetWidth = minOf(screenWidth, MAX_WIDTH)
            val scale = targetWidth.toFloat() / screenWidth
            val targetHeight = (screenHeight * scale).toInt()

            // Clean up previous reader/display
            virtualDisplay?.release()
            imageReader?.close()

            imageReader = ImageReader.newInstance(targetWidth, targetHeight, PixelFormat.RGBA_8888, 2)

            if (handlerThread == null || handlerThread?.isAlive == false) {
                handlerThread = HandlerThread("ScreenCapture").apply { start() }
                handler = Handler(handlerThread!!.looper)
            }

            virtualDisplay = projection.createVirtualDisplay(
                "AgentCapture",
                targetWidth,
                targetHeight,
                screenDensity,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader!!.surface,
                null,
                handler
            )

            // Allow one frame to render
            handler!!.postDelayed({
                try {
                    val image: Image? = imageReader?.acquireLatestImage()
                    if (image == null) {
                        promise.reject("NO_IMAGE", "Could not acquire screen image")
                        return@postDelayed
                    }

                    val base64 = imageToBase64(image, targetWidth, targetHeight)
                    image.close()
                    virtualDisplay?.release()
                    virtualDisplay = null
                    promise.resolve(base64)
                } catch (e: Exception) {
                    Log.e(TAG, "Capture error", e)
                    promise.reject("CAPTURE_ERROR", e.message)
                }
            }, 300)

        } catch (e: Exception) {
            Log.e(TAG, "Setup error", e)
            promise.reject("SETUP_ERROR", e.message)
        }
    }

    private fun imageToBase64(image: Image, width: Int, height: Int): String {
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * width

        val bitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)

        // Crop to exact dimensions if needed
        val cropped = if (bitmap.width != width) {
            Bitmap.createBitmap(bitmap, 0, 0, width, height)
        } else bitmap

        val outputStream = ByteArrayOutputStream()
        cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, outputStream)

        if (cropped !== bitmap) cropped.recycle()
        bitmap.recycle()

        return Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)
    }

    @ReactMethod
    fun release(promise: Promise) {
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
        handlerThread?.quitSafely()
        handlerThread = null
        handler = null
        promise.resolve(true)
    }

    override fun onCatalystInstanceDestroy() {
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
        handlerThread?.quitSafely()
    }
}
