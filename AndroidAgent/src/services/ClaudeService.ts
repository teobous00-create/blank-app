import {NativeModules} from 'react-native';
import {ActionResult, IntentPlan} from '../types';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const API_KEY_STORAGE = 'anthropic_api_key';

async function getApiKey(): Promise<string> {
  const key = await NativeModules.StorageModule.getItem(API_KEY_STORAGE);
  if (!key) {
    throw new Error('Anthropic API key not set. Please configure it in the setup screen.');
  }
  return key;
}

async function callClaude(body: object): Promise<string> {
  const apiKey = await getApiKey();

  const response = await fetch(ANTHROPIC_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.content?.[0]?.text ?? '';
  return content;
}

function extractJSON(text: string): string {
  // Strip markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try to find first { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text.trim();
}

export async function parseIntent(voiceText: string): Promise<IntentPlan> {
  const raw = await callClaude({
    model: MODEL,
    max_tokens: 1024,
    system: `You are an Android automation agent. Parse the voice command into a structured action plan.
Respond ONLY with valid JSON, no markdown, no explanation.
The JSON must match this schema exactly:
{
  "goal": "short description of the overall task",
  "app_package": "com.example.app or null if unknown",
  "steps": ["step 1", "step 2", "..."]
}
If a step involves payment, checkout, or placing an order, prefix it with "PAUSE_FOR_CONFIRMATION: ".`,
    messages: [
      {
        role: 'user',
        content: voiceText,
      },
    ],
  });

  try {
    return JSON.parse(extractJSON(raw)) as IntentPlan;
  } catch {
    throw new Error(`Failed to parse intent JSON from Claude: ${raw}`);
  }
}

export async function analyzeScreenAndAct(
  screenshotBase64: string,
  goal: string,
  completedSteps: string[],
  nextStep: string,
): Promise<ActionResult> {
  const completedSummary =
    completedSteps.length > 0
      ? `Completed steps:\n${completedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
      : 'No steps completed yet.';

  const raw = await callClaude({
    model: MODEL,
    max_tokens: 512,
    system: `You are controlling an Android phone to complete a task.
Analyze the screenshot and determine the SINGLE next action to take.
Respond ONLY with valid JSON, no markdown.

JSON schema:
{
  "action": "tap" | "type" | "scroll_down" | "scroll_up" | "wait" | "done" | "failed" | "confirm_with_user",
  "target_text": "visible text of the element to tap (string or null)",
  "coordinates": {"x": number, "y": number} or null,
  "type_value": "text to type (string or null)",
  "reason": "brief explanation of what you see and why this action",
  "confidence": 0.0 to 1.0
}

Rules:
- Prefer target_text over coordinates when element text is visible
- If you see a payment, checkout, place order, confirm order screen → return action: "confirm_with_user"
- If the task is fully complete → return action: "done"
- If the task is impossible or stuck → return action: "failed"
- confidence below 0.4 → prefer "wait" or "scroll_down" to find more content`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: `Overall goal: ${goal}\n\n${completedSummary}\n\nNext step to accomplish: ${nextStep}\n\nWhat is the single next action?`,
          },
        ],
      },
    ],
  });

  try {
    return JSON.parse(extractJSON(raw)) as ActionResult;
  } catch {
    throw new Error(`Failed to parse action JSON from Claude: ${raw}`);
  }
}

export {API_KEY_STORAGE};
