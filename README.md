# Shireenzs Apki Sakhi — AI for Senior Citizens

A senior-friendly AI companion focused on dignity, voice access, simple language, digital-safety guidance and everyday support.

## Core features
- Gemini-powered conversational support through a server-side API.
- Optional browser speech input and text-to-speech.
- Large, readable, responsive interface with keyboard focus states and skip navigation.
- Everyday support prompts for medicine, hydration and digital safety.
- Clearly labelled synthetic wellness-demo telemetry.
- Safety guardrails: not a medical device and not a replacement for professional care.
- Local fallback responses when Gemini is not configured.

## Architecture
React + Vite frontend → Express API → Google Gemini API.

The Gemini API key is read only from the server environment variable GEMINI_API_KEY and is never placed in client-side code.

## Run locally
Prerequisite: Node.js 20+ recommended.

```bash
npm install
```

Create .env.local from .env.example and set your own key, then run:

```bash
npm run dev
```

## Quality checks
```bash
npm test
npm run build
```

The test command runs the TypeScript static check. The build command verifies the Vite client and server bundle.

## Security and privacy
- API keys are environment variables, not source code.
- Request bodies and text inputs are size-limited.
- Basic security headers and an in-memory API rate limit are applied.
- Provider error details are not returned to users.
- Demo telemetry is synthetic; this repository does not claim real wearable integration.
- Do not enter highly sensitive personal or medical information into the demo.

## Accessibility
Semantic headings and labels, visible keyboard focus, skip navigation, live conversation announcements, responsive controls, reduced-motion support, voice input where supported, and text-to-speech.

## Limitations
Speech recognition varies by browser. Pulse values are synthetic. This project is not a medical device, emergency service, or replacement for professional care. Production use with real health data would require appropriate privacy, security, consent, clinical and regulatory review.

## Project
Challenge: Shireenzs Apki Sakhi — AI for Senior Citizens
Repository: https://github.com/ShireeKhan27/Shireenzs-Apki-Sakhi--Ai-for-Senior-Citizenss
