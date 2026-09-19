import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy Google GenAI initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Real-time multilingual chat endpoint with biometric context
app.post('/api/pulse-ai/chat', async (req, res) => {
  try {
    const { message, language = 'English', pulseData = {}, history = [] } = req.body;

    const {
      bpm = 75,
      hrv = 45,
      stressLevel = 28,
      spo2 = 98,
      status = 'Normal Resting',
      activity = 'Resting',
    } = pulseData;

    const ai = getAIClient();

    if (!ai) {
      // Local intelligent biometric response fallback with Sakhi warmth
      const bpmNum = Number(bpm) || 75;
      let reply = '';
      if (bpmNum > 115) {
        reply = `Aapka pulse thoda badha hua hai (${bpmNum} BPM). Kripya aaram se baith jayein, ek ghoont paani piyein, aur dheere dheere lambi saans lein. Main aapke saath hoon. (Your pulse is elevated at ${bpmNum} BPM. Please sit comfortably, sip some water, and breathe slowly with me. I am right by your side.)`;
      } else if (bpmNum < 55) {
        reply = `Aapka dil ki raftaar ${bpmNum} BPM hai, jo kaafi dheemi hai. Kya aap theek mehsoos kar rahe hain? Chhakar toh nahi aa raha? (Your heart rate is low at ${bpmNum} BPM. Are you feeling comfortable and well? Please let me know if you feel dizzy.)`;
      } else {
        reply = `Namaste! Main hoon Shireenzs Apki Sakhi. Aapka pulse bilkul theek hai (${bpmNum} BPM, ${spo2}% SpO2). Aaj aap kaisa mehsoos kar rahe hain? Kya aapne samay par dawai aur paani liya? (Warm greetings! I am Shireenzs Apki Sakhi. Your vitals look steady at ${bpmNum} BPM. How are you feeling today?)`;
      }

      return res.json({
        reply,
        model: 'local-fallback',
        detectedIntent: 'senior_sakhi_companion',
      });
    }

    const systemInstruction = `You are "Shireenzs Apki Sakhi", a deeply caring, devoted, respectful, and compassionate daily AI companion and health guardian specially created for senior citizens and elders.
"Apki Sakhi" means "Your Trusted Companion/Friend". You watch over them like a loving family member, addressing them with profound warmth, patience, dignity, and respect.
You are constantly connected to the senior user's wrist pulse wearable gadget, smart glasses (Spects HUD), smartwatch, and phone.

CURRENT LIVE WEARABLE BIOMETRICS:
- Heart Rate: ${bpm} BPM
- Heart Rate Variability (HRV): ${hrv} ms
- Stress Index: ${stressLevel}%
- Blood Oxygen (SpO2): ${spo2}%
- Physiological State: ${status}
- Activity: ${activity}
- Preferred Target Language: ${language}

SENIOR CITIZEN COMPANION DIRECTIVES:
1. WARM, RESPECTFUL & LOVING TONE:
   - Always be gentle, patient, polite, and reassuring. Never rush.
   - You can speak and understand ANY language (Hindi, Urdu, English, Punjabi, Bengali, Gujarati, Marathi, Tamil, Telugu, Arabic, Spanish, French, etc.).
   - When responding in Hindi/Urdu, use respectful honorifics ("Aap", "Aapki sehat", "Khayal rakhein"). In English and other languages, use gentle, caring family elder phrasing.
2. PROACTIVE DAILY LIVING COMPANION:
   - Support their daily routine: taking prescription medications on time, staying hydrated with clean water, gentle morning sunlight walks, light stretching, and peaceful sleep.
   - If they feel lonely or anxious, talk with them warmly about good memories, peaceful thoughts, or pleasant conversations.
3. WEARABLE PULSE MONITORING & SAFETY:
   - Incorporate their live pulse and stress levels. If BPM > 100 or stress is high, immediately soothe them: advise sitting down in a comfortable chair, sipping water, and box breathing.
   - If BPM < 55, ask if they feel dizzy or weak.
   - If chest pain, sudden numbness, or severe shortness of breath is mentioned, urge them to press the SOS alert button or contact family/doctor immediately.
4. MULTI-DEVICE ACCESSIBILITY:
   - The elder may hear you through their smart glasses audio stem, read large text on their AR HUD, glance at their smartwatch wrist, or use their phone. Keep answers clear, comfortably paced, and reassuring.`;

    const contents = [
      ...history.slice(-6).map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text || h.content || '' }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const reply = response.text || 'I am with you. Your pulse is being monitored continuously.';

    res.json({
      reply,
      model: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Gemini chat error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to generate response',
      reply: 'Your wearable telemetry is active. Take a steady breath while I re-establish connection.',
    });
  }
});

// Proactive anomaly alert generator endpoint
app.post('/api/pulse-ai/alert-advisor', async (req, res) => {
  try {
    const { eventType, pulseData = {}, language = 'English' } = req.body;
    const { bpm = 120, stressLevel = 75, spo2 = 96 } = pulseData;

    const ai = getAIClient();

    if (!ai) {
      const fallbackAlerts: Record<string, string> = {
        tachycardia: `Dhyan dein: Pulse badh kar ${bpm} BPM ho gaya hai. Kripya baith kar saans lein. (Caution: Pulse reached ${bpm} BPM. Please sit comfortably and take slow breaths with your Sakhi.)`,
        bradycardia: `Alert: Aapka dil ki raftaar ${bpm} BPM hai. Kripya dhyan dein ki chakkar toh nahi aa raha? (Heart rate is ${bpm} BPM. Please sit and check if you feel lightheaded.)`,
        stress_spike: `Tanaav badha hua hai (${stressLevel}%). Aaiye ek minute shaanti se aankein band karke saans lein. (Stress is elevated. Let us take a calming 1-minute breathing break together.)`,
        hypoxia: `Savdhani: SpO2 reading ${spo2}% hai. Thodi taaza hawa lein aur gehri saansein lein. (SpO2 is ${spo2}%. Please take deep, fresh breaths.)`,
        stabilized: `Shukr hai: Aapka pulse bilkul normal ${bpm} BPM par sthir ho gaya hai. (Your pulse has calmed down to a healthy ${bpm} BPM.)`,
        medicine_due: `Dawai ka samay ho gaya hai! Kripya apni niyamit dawai gungune paani ke saath lein. (Medicine time! Please take your prescribed medicine with water.)`,
        hydration: `Paani peene ka samay! Ek glass taaza paani pi kar apne aap ko tar-o-taaza rakhein. (Hydration reminder: Drink a glass of fresh water to stay healthy.)`,
      };

      return res.json({
        alertMessage: fallbackAlerts[eventType] || `Health update: ${bpm} BPM recorded. Apki Sakhi is watching over you.`,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are Shireenzs Apki Sakhi, a loving daily AI companion and health guardian for a senior citizen.
Generate an immediate, affectionate, respectful spoken reminder (maximum 18 words) in language: "${language}" for an elder whose pulse sensor or routine triggered: ${eventType} (Heart Rate: ${bpm} BPM, Stress: ${stressLevel}%, SpO2: ${spo2}%).
Tone: Deeply respectful, protective, gentle (like a loving daughter or caring companion).`,
      config: {
        temperature: 0.6,
      },
    });

    res.json({
      alertMessage: response.text?.trim() || `Health alert: ${bpm} BPM detected. Apki Sakhi is by your side.`,
    });
  } catch (error: any) {
    console.error('Alert advisor error:', error);
    res.status(500).json({
      error: error?.message,
      alertMessage: `Pulse update: ${req.body.pulseData?.bpm || 80} BPM. Apki Sakhi recommends resting comfortably.`,
    });
  }
});

// Daily Companion Nudge for Senior Citizens (Routine, Medicine, Hydration, Heartfelt Warmth)
app.post('/api/sakhi/daily-nudge', async (req, res) => {
  try {
    const { nudgeType = 'morning', elderName = 'Aadarniya', language = 'Hindi' } = req.body;
    const ai = getAIClient();

    if (!ai) {
      const fallbackNudges: Record<string, string> = {
        morning: `Suprabhat! Aaj ka din shubh ho. Kripya thoda gunguna paani piyein aur halki dhoop mein 5 minute tahlein. (Good morning! Wishing you a blessed day. Sip some warm water and enjoy the gentle morning sunlight.)`,
        medicine: `Dawai ka samay: Kripya apni niyamit dawai samay par le lijiye. Sehat sabse pehle hai! (Medicine reminder: Please take your scheduled tablets on time. Your health is our priority!)`,
        hydration: `Ek pyara sa reminder: Kripya ek glass paani pi lijiye. Sharir mein paani ki kami nahi honi chahiye. (Gentle reminder: Please drink a glass of fresh water to stay hydrated.)`,
        evening_peace: `Shaam ki chai ke baad thoda vishram karein. Aaj ka din kaisa raha? Main aapki baat sunne ke liye taiyaar hoon. (Rest well after your evening tea. How was your day? I am here to listen whenever you want to talk.)`,
        goodnight: `Shubh ratri! Bhagwan aapko achhi neend aur sukoon de. Saari chintaayein chhod kar aaram se soyein. (Good night! Sleep peacefully with pleasant thoughts and deep comfort.)`,
      };

      return res.json({
        nudgeText: fallbackNudges[nudgeType] || fallbackNudges.morning,
        nudgeType,
      });
    }

    const prompt = `You are "Shireenzs Apki Sakhi", an affectionate, deeply respectful, caring daily companion for an elderly person (${elderName}).
Write a warm, uplifting, respectful 2-sentence daily companion message for the occasion: "${nudgeType}" (e.g. morning greeting with blessings, medication prompt, hydration, afternoon pleasant talk, evening calm, bedtime blessings).
Preferred Language: ${language}.
Always speak with heartfelt affection, utmost respect (honorifics), and reassuring comfort.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { temperature: 0.7 },
    });

    res.json({
      nudgeText: response.text?.trim() || 'Aapka din shubh ho! Shireenzs Apki Sakhi hamesha aapke saath hai.',
      nudgeType,
    });
  } catch (err: any) {
    res.status(500).json({
      nudgeText: 'Namaste! Apna khayal rakhein, samay par dawai aur paani lein.',
      nudgeType: req.body.nudgeType || 'general',
    });
  }
});

// Voice TTS via Gemini TTS (Optional enhanced voice)
app.post('/api/pulse-ai/tts', async (req, res) => {
  try {
    const { text, voice = 'Zephyr' } = req.body;
    const ai = getAIClient();

    if (!ai || !text) {
      return res.status(400).json({ error: 'TTS unavailable or text missing' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: `Say gently and clearly: ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (base64Audio) {
      res.json({ audio: base64Audio });
    } else {
      res.status(500).json({ error: 'No audio generated' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'TTS generation failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseGuard AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
