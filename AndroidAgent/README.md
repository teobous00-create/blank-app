# Android AI Agent

A personal Android app that listens to voice commands and autonomously controls any app on your phone to complete tasks — powered by Claude AI vision and Android Accessibility Services.

**Example:** _"Open efood and order coffee from La Dolce"_ → the agent navigates the app, searches for the restaurant, finds the item, adds to cart, then pauses for your confirmation before checkout.

---

## Architecture

```
Voice Input (SpeechRecognizer)
        ↓
Claude API — parseIntent() → action plan JSON
        ↓
Agent Loop (max 25 actions):
  ├── MediaProjection screenshot
  ├── Claude Vision — analyzeScreenAndAct() → next action JSON
  ├── AccessibilityService — executes tap/type/scroll
  └── wait 1.5s → repeat
        ↓
User Notification (done / failed / confirmation modal)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| JDK | 17 |
| Android SDK | API 26–35 |
| Android Build Tools | 35.0.0 |
| Physical Android device | Android 8.0+ |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

> ⚠️ A **physical device** is required. Accessibility Services and overlay windows do not work reliably on emulators.

---

## Setup & Build

### 1. Install dependencies

```bash
cd AndroidAgent
npm install
```

### 2. Generate a debug keystore (first time only)

```bash
cd android/app
keytool -genkey -v \
  -keystore debug.keystore \
  -storepass android \
  -alias androiddebugkey \
  -keypass android \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"
cd ../..
```

### 3. Connect your device

```bash
# Enable Developer Mode on device:
# Settings → About Phone → tap Build Number 7 times
# Then: Settings → Developer Options → USB Debugging ON

adb devices   # should list your device
```

### 4. Run on device

```bash
# Terminal 1 — Metro bundler
npx react-native start

# Terminal 2 — Build & install
npx react-native run-android
```

---

## First Launch — Permission Setup

When the app opens you'll see the Setup Screen:

### Step 1 — Enter API Key
Paste your Anthropic API key (starts with `sk-ant-`). It is stored with `AsyncStorage` on-device only.

### Step 2 — Grant Microphone
Tap **Microphone** → Allow in the system dialog.

### Step 3 — Allow Overlay
Tap **Draw Over Other Apps** → you'll be sent to Settings. Find **Android AI Agent** and toggle it on.

### Step 4 — Enable Accessibility Service
Tap **Accessibility Service** → Settings opens at the Accessibility page.

1. Scroll to **Downloaded Apps** or **Installed Services**
2. Find **Android AI Agent**
3. Toggle it **ON**
4. Tap **Allow** when prompted

> The accessibility service description explains: _"Allows AndroidAgent to control your phone to complete voice-commanded tasks."_

---

## Usage

Once setup is complete, a floating 🎤 button appears in the corner of every screen.

| Button state | Meaning |
|---|---|
| 🎤 white | Idle — tap to speak |
| 🔴 pulsing | Listening to your voice |
| 🟠 spinning | Claude is thinking |
| ⚙️ `3/7` blue | Executing step 3 of 7 |
| ❓ yellow | Needs your confirmation |
| ✅ green | Task complete |
| ❌ red | Task failed |

**To speak:** tap the button, say your command clearly, wait for transcription.

**To stop:** tap the button while it's spinning/executing.

**To drag:** long-press and drag the button to reposition it.

---

## Safety Rules

- **Max 25 actions** per task session
- Any step containing `checkout`, `pay`, `confirm order`, `place order` → **always pauses** and shows a confirmation modal
- User can **stop at any time** by tapping the button
- API key **never stored in plaintext** in code — uses `AsyncStorage`

---

## Project Structure

```
AndroidAgent/
├── android/
│   └── app/src/main/
│       ├── java/com/androidagent/
│       │   ├── AccessibilityAgentService.kt   # Accessibility service + UI control
│       │   ├── AccessibilityBridgeModule.kt   # RN bridge for accessibility
│       │   ├── ScreenCaptureModule.kt         # MediaProjection screenshot
│       │   ├── VoiceInputModule.kt            # SpeechRecognizer wrapper
│       │   ├── AgentPackage.kt                # Registers all native modules
│       │   ├── MainApplication.kt
│       │   └── MainActivity.kt
│       ├── res/xml/
│       │   └── accessibility_service_config.xml
│       └── AndroidManifest.xml
├── src/
│   ├── types/index.ts                         # Shared TypeScript types
│   ├── services/
│   │   ├── ClaudeService.ts                   # Anthropic API calls
│   │   └── AgentController.ts                 # Agent loop orchestration
│   └── components/
│       ├── FloatingOverlay.tsx                # Draggable floating button
│       ├── ConfirmationModal.tsx              # Payment confirmation dialog
│       └── SetupScreen.tsx                    # First-launch onboarding
├── App.tsx
├── index.js
└── package.json
```

---

## Troubleshooting

**"Accessibility service is not enabled"**
→ Go to Settings → Accessibility → Android AI Agent → Enable

**"Screen capture permission denied"**
→ Tap the floating button again; the system dialog will re-appear

**Voice not recognising Greek**
→ Install Greek speech pack: Settings → General Management → Language → Text-to-Speech → install Greek offline pack

**Build fails with Kotlin version error**
→ Check `android/build.gradle` `kotlinVersion` matches your installed Kotlin Gradle plugin

**App crashes on first tap**
→ Check `adb logcat -s AndroidAgent` for the root cause
