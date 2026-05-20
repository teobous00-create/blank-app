package com.androidagent

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = VoiceInputModule.NAME)
class VoiceInputModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "VoiceInputModule"
        private const val TAG = "VoiceInput"

        // Events emitted to JS
        const val EVENT_LISTENING_STARTED = "VoiceListeningStarted"
        const val EVENT_PARTIAL_RESULT = "VoicePartialResult"
        const val EVENT_ERROR = "VoiceError"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingPromise: Promise? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName() = NAME

    @ReactMethod
    fun startListening(language: String, promise: Promise) {
        if (pendingPromise != null) {
            promise.reject("ALREADY_LISTENING", "Already listening for voice input")
            return
        }

        if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
            promise.reject("NOT_AVAILABLE", "SpeechRecognizer not available on this device")
            return
        }

        pendingPromise = promise

        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext).apply {
                    setRecognitionListener(buildListener())
                }

                val lang = when (language.lowercase()) {
                    "greek", "el", "el-gr" -> "el-GR"
                    else -> "en-US"
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                    putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, true)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                }

                speechRecognizer?.startListening(intent)
                emitEvent(EVENT_LISTENING_STARTED, null)
                Log.d(TAG, "Started listening [$lang]")
            } catch (e: Exception) {
                Log.e(TAG, "startListening error", e)
                pendingPromise?.reject("START_ERROR", e.message)
                pendingPromise = null
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        mainHandler.post {
            speechRecognizer?.stopListening()
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun cancelListening(promise: Promise) {
        mainHandler.post {
            speechRecognizer?.cancel()
            pendingPromise?.reject("CANCELLED", "Listening cancelled by user")
            pendingPromise = null
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactContext))
    }

    private fun buildListener() = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            Log.d(TAG, "Ready for speech")
        }

        override fun onBeginningOfSpeech() {
            Log.d(TAG, "Speech begun")
        }

        override fun onRmsChanged(rmsdB: Float) {}

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Log.d(TAG, "Speech ended")
        }

        override fun onError(error: Int) {
            val message = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                SpeechRecognizer.ERROR_CLIENT -> "Client error"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                SpeechRecognizer.ERROR_NETWORK -> "Network error"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                SpeechRecognizer.ERROR_NO_MATCH -> "No speech match — please try again"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                SpeechRecognizer.ERROR_SERVER -> "Server error"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected — please try again"
                else -> "Unknown error ($error)"
            }
            Log.w(TAG, "onError: $message")

            val args = Arguments.createMap().apply {
                putInt("code", error)
                putString("message", message)
            }
            emitEvent(EVENT_ERROR, args)

            pendingPromise?.reject("VOICE_ERROR", message)
            pendingPromise = null
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val transcript = matches?.firstOrNull() ?: ""
            Log.d(TAG, "Result: $transcript")
            pendingPromise?.resolve(transcript)
            pendingPromise = null
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val partial = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull() ?: return
            val args = Arguments.createMap().apply {
                putString("partial", partial)
            }
            emitEvent(EVENT_PARTIAL_RESULT, args)
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun emitEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun onCatalystInstanceDestroy() {
        mainHandler.post {
            speechRecognizer?.destroy()
            speechRecognizer = null
        }
        pendingPromise?.reject("DESTROYED", "Module destroyed")
        pendingPromise = null
    }
}
