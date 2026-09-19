import type { Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const MAX_TEXT = 4000;
const requestLog = new Map<string, { count: number; resetAt: number }>();

function cleanText(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safePulse(value: unknown) {
  const p = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    bpm: Math.max(30, Math.min(220, num(p.bpm, 78))),
    hrv: Math.max(0, Math.min(300, num(p.hrv, 46))),
    stressLevel: Math.max(0, Math.min(100, num(p.stressLevel, 24))),
    spo2: Math.max(70, Math.min(100, num(p.spo2, 98))),
    status: cleanText(p.status, 80) || "Normal resting",
    activity: cleanText(p.activity, 80) || "Resting",
  };
}

function fallback(p: ReturnType<typeof safePulse>) {
  if (p.bpm > 115) {
    return `Pulse ${p.bpm} BPM hai. Aaram se baithiye. Chest pain, behoshi ya severe saans ki dikkat ho to turant family, doctor ya local emergency service se sampark karein.`;
  }
  if (p.bpm < 55) {
    return `Pulse ${p.bpm} BPM hai. Agar chakkar, behoshi ya bahut kamzori ho to baith jaiye aur medical help lein.`;
  }
  return `Namaste! Main Aapki Sakhi hoon. Demo reading ${p.bpm} BPM aur SpO2 ${p.spo2}% hai. Main general guidance de sakti hoon, diagnosis nahi.`;
}

function getAI() {
  const key = process.env.GEMINI_API_KEY;
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

function rateLimited(ip: string) {
  const now = Date.now();
  const current = requestLog.get(ip);
  if (!current || now > current.resetAt) {
    requestLog.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (current.count >= 30) return true;
  current.count++;
  return false;
}

export default async (req: Request) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "microphone=(self)",
  };

  if (req.method !== "POST" && new URL(req.url).pathname !== "/api/health") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  }

  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "anonymous";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please wait a minute and try again." }), { status: 429, headers });
  }

  const pathname = new URL(req.url).pathname;

  if (pathname === "/api/health") {
    return new Response(JSON.stringify({ status: "ok", aiConfigured: Boolean(process.env.GEMINI_API_KEY) }), { status: 200, headers });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request." }), { status: 400, headers });
  }

  try {
    const ai = getAI();

    if (pathname === "/api/pulse-ai/chat") {
      const message = cleanText(body.message);
      if (!message) return new Response(JSON.stringify({ error: "Message is required." }), { status: 400, headers });

      const language = cleanText(body.language, 40) || "English";
      const pulse = safePulse(body.pulseData);
      const history = Array.isArray(body.history)
        ? body.history.slice(-6)
            .map((h: any) => ({
              role: h?.role === "model" ? "model" : "user",
              text: cleanText(h?.text || h?.content, 1500),
            }))
            .filter((h: any) => h.text)
        : [];

      if (!ai) return new Response(JSON.stringify({ reply: fallback(pulse), model: "local-fallback" }), { status: 200, headers });

      const systemInstruction = `You are Shireenzs Apki Sakhi, a respectful AI companion for senior citizens. Use simple, calm language. Preferred language: ${language}. This is a wellness and digital-support demo, not a medical diagnostic device. Never claim to diagnose or replace a clinician. If chest pain, severe breathing difficulty, fainting, sudden weakness/numbness or another possible emergency is mentioned, advise contacting local emergency services/family/doctor immediately. Do not invent wearable data. Synthetic demo telemetry: HR ${pulse.bpm}, HRV ${pulse.hrv}, stress ${pulse.stressLevel}%, SpO2 ${pulse.spo2}%.`;

      const contents = [
        ...history.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] })),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: { systemInstruction, thinkingConfig: { thinkingLevel: "low" } },
      });

      return new Response(JSON.stringify({
        reply: response.text?.trim() || "I am here with you. Please tell me how I can help.",
        model: "gemini-3.8-flash",
      }), { status: 200, headers });
    }

    if (pathname === "/api/pulse-ai/alert-advisor") {
      const eventType = cleanText(body.eventType, 60) || "health_update";
      const language = cleanText(body.language, 40) || "English";
      const pulse = safePulse(body.pulseData);

      if (!ai) {
        return new Response(JSON.stringify({
          alertMessage: `Health update: ${pulse.bpm} BPM. If you feel unwell, please sit comfortably and contact someone you trust.`,
        }), { status: 200, headers });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Create one short respectful spoken reminder in ${language}, maximum 30 words, for a senior citizen. Event: ${eventType}. HR: ${pulse.bpm}. Stress: ${pulse.stressLevel}%. SpO2: ${pulse.spo2}%. Do not diagnose or claim the reading is medically safe.`,
        config: { thinkingConfig: { thinkingLevel: "low" } },
      });

      return new Response(JSON.stringify({
        alertMessage: response.text?.trim() || "Please pause, sit comfortably, and contact someone you trust if you feel unwell.",
      }), { status: 200, headers });
    }

    if (pathname === "/api/sakhi/daily-nudge") {
      const type = cleanText(body.nudgeType, 40) || "morning";
      const name = cleanText(body.elderName, 60) || "Aadarniya";
      const language = cleanText(body.language, 40) || "Hindi";

      if (!ai) {
        return new Response(JSON.stringify({
          nudgeText: "Aapka din shubh ho. Apni routine aur prescribed medicines ko samay par follow karna yaad rakhein.",
          nudgeType: type,
        }), { status: 200, headers });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Write two warm respectful sentences for an elderly person named ${name}. Occasion: ${type}. Language: ${language}. Do not diagnose or give unsafe treatment advice.`,
        config: { thinkingConfig: { thinkingLevel: "low" } },
      });

      return new Response(JSON.stringify({
        nudgeText: response.text?.trim() || "Aapka din shubh ho. Apna khayal rakhein.",
        nudgeType: type,
      }), { status: 200, headers });
    }

    if (pathname === "/api/pulse-ai/tts") {
      const text = cleanText(body.text, 2000);
      const voice = cleanText(body.voice, 40) || "Zephyr";
      if (!text) return new Response(JSON.stringify({ error: "Text is required." }), { status: 400, headers });
      if (!ai) return new Response(JSON.stringify({ error: "Server-side TTS is not configured." }), { status: 503, headers });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Say gently and clearly: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });

      const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audio) return new Response(JSON.stringify({ error: "No audio generated." }), { status: 502, headers });
      return new Response(JSON.stringify({ audio }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "API route not found." }), { status: 404, headers });
  } catch (error) {
    console.error("Apki Sakhi API error:", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: "AI service is temporarily unavailable." }), { status: 502, headers });
  }
};

export const config: Config = {
  path: "/api/*",
};
