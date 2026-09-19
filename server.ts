import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();
const app=express();
const PORT=Number(process.env.PORT||3000);
const MAX_TEXT=4000;
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','microphone=(self)');next();});

const requestLog=new Map<string,{count:number;resetAt:number}>();
function rateLimit(req:express.Request,res:express.Response,next:express.NextFunction){
 const now=Date.now(),key=req.ip||'anonymous',cur=requestLog.get(key);
 if(!cur||now>cur.resetAt){requestLog.set(key,{count:1,resetAt:now+60000});return next();}
 if(cur.count>=30)return res.status(429).json({error:'Too many requests. Please wait a minute and try again.'});
 cur.count++;next();
}
app.use('/api',rateLimit);

let aiClient:GoogleGenAI|null=null;
function getAIClient(){const key=process.env.GEMINI_API_KEY;if(!key)return null;if(!aiClient)aiClient=new GoogleGenAI({apiKey:key});return aiClient;}
function cleanText(v:unknown,max=MAX_TEXT){return typeof v==='string'?v.trim().slice(0,max):'';}
function num(v:unknown,f:number){const n=Number(v);return Number.isFinite(n)?n:f;}
function safePulse(v:unknown){const p=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;return{bpm:Math.max(30,Math.min(220,num(p.bpm,78))),hrv:Math.max(0,Math.min(300,num(p.hrv,46))),stressLevel:Math.max(0,Math.min(100,num(p.stressLevel,24))),spo2:Math.max(70,Math.min(100,num(p.spo2,98))),status:cleanText(p.status,80)||'Normal resting',activity:cleanText(p.activity,80)||'Resting'};}
function fallback(p:ReturnType<typeof safePulse>){if(p.bpm>115)return `Pulse ${p.bpm} BPM hai. Aaram se baithiye. Chest pain, behoshi ya severe saans ki dikkat ho to turant family, doctor ya local emergency service se sampark karein.`;if(p.bpm<55)return `Pulse ${p.bpm} BPM hai. Agar chakkar, behoshi ya bahut kamzori ho to baith jaiye aur medical help lein.`;return `Namaste! Main Aapki Sakhi hoon. Demo reading ${p.bpm} BPM aur SpO2 ${p.spo2}% hai. Main general guidance de sakti hoon, diagnosis nahi.`;}

app.get('/api/health',(_req,res)=>res.json({status:'ok',aiConfigured:Boolean(process.env.GEMINI_API_KEY)}));

app.post('/api/pulse-ai/chat',async(req,res)=>{
 try{
  const message=cleanText(req.body?.message);if(!message)return res.status(400).json({error:'Message is required.'});
  const language=cleanText(req.body?.language,40)||'English',pulse=safePulse(req.body?.pulseData);
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-6).map((h:any)=>({role:h?.role==='model'?'model':'user',text:cleanText(h?.text||h?.content,1500)})).filter((h:any)=>h.text):[];
  const ai=getAIClient();if(!ai)return res.json({reply:fallback(pulse),model:'local-fallback'});
  const systemInstruction=`You are Shireenzs Apki Sakhi, a respectful AI companion for senior citizens. Use simple, calm language. Preferred language: ${language}. This is a wellness and digital-support demo, not a medical diagnostic device. Never claim to diagnose or replace a clinician. If chest pain, severe breathing difficulty, fainting, sudden weakness/numbness or another possible emergency is mentioned, advise contacting local emergency services/family/doctor immediately. Do not invent wearable data. Synthetic demo telemetry: HR ${pulse.bpm}, HRV ${pulse.hrv}, stress ${pulse.stressLevel}%, SpO2 ${pulse.spo2}%.`;
  const contents=[...history.map((h:any)=>({role:h.role,parts:[{text:h.text}]})),{role:'user',parts:[{text:message}]}];
  const response=await ai.models.generateContent({model:'gemini-3.8-flash',contents,config:{systemInstruction,thinkingConfig:{thinkingLevel:'low'}}});
  res.json({reply:response.text?.trim()||'I am here with you. Please tell me how I can help.',model:'gemini-3.8-flash'});
 }catch(e){console.error('Gemini chat error:',e instanceof Error?e.message:'unknown');res.status(502).json({error:'AI service is temporarily unavailable.'});}
});

app.post('/api/pulse-ai/alert-advisor',async(req,res)=>{
 try{
  const eventType=cleanText(req.body?.eventType,60)||'health_update',language=cleanText(req.body?.language,40)||'English',p=safePulse(req.body?.pulseData),ai=getAIClient();
  if(!ai)return res.json({alertMessage:`Health update: ${p.bpm} BPM. If you feel unwell, please sit comfortably and contact someone you trust.`});
  const r=await ai.models.generateContent({model:'gemini-3.8-flash',contents:`Create one short respectful spoken reminder in ${language}, maximum 30 words, for a senior citizen. Event: ${eventType}. HR: ${p.bpm}. Stress: ${p.stressLevel}%. SpO2: ${p.spo2}%. Do not diagnose or claim the reading is medically safe.`,config:{thinkingConfig:{thinkingLevel:'low'}}});
  res.json({alertMessage:r.text?.trim()||'Please pause, sit comfortably, and contact someone you trust if you feel unwell.'});
 }catch(e){console.error('Alert error:',e instanceof Error?e.message:'unknown');res.status(502).json({error:'AI service is temporarily unavailable.'});}
});

app.post('/api/sakhi/daily-nudge',async(req,res)=>{
 try{
  const type=cleanText(req.body?.nudgeType,40)||'morning',name=cleanText(req.body?.elderName,60)||'Aadarniya',language=cleanText(req.body?.language,40)||'Hindi',ai=getAIClient();
  if(!ai)return res.json({nudgeText:'Aapka din shubh ho. Apni routine aur prescribed medicines ko samay par follow karna yaad rakhein.',nudgeType:type});
  const r=await ai.models.generateContent({model:'gemini-3.8-flash',contents:`Write two warm respectful sentences for an elderly person named ${name}. Occasion: ${type}. Language: ${language}. Do not diagnose or give unsafe treatment advice.`,config:{thinkingConfig:{thinkingLevel:'low'}}});
  res.json({nudgeText:r.text?.trim()||'Aapka din shubh ho. Apna khayal rakhein.',nudgeType:type});
 }catch(e){console.error('Nudge error:',e instanceof Error?e.message:'unknown');res.status(502).json({error:'AI service is temporarily unavailable.'});}
});

app.post('/api/pulse-ai/tts',async(req,res)=>{
 try{
  const text=cleanText(req.body?.text,2000),voice=cleanText(req.body?.voice,40)||'Zephyr';if(!text)return res.status(400).json({error:'Text is required.'});
  const ai=getAIClient();if(!ai)return res.status(503).json({error:'Server-side TTS is not configured.'});
  const r=await ai.models.generateContent({model:'gemini-3.1-flash-tts-preview',contents:[{parts:[{text:`Say gently and clearly: ${text}`}]}],config:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}});
  const audio=r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;if(!audio)return res.status(502).json({error:'No audio generated.'});res.json({audio});
 }catch(e){console.error('TTS error:',e instanceof Error?e.message:'unknown');res.status(502).json({error:'Voice service is temporarily unavailable.'});}
});

async function startServer(){
 if(process.env.NODE_ENV!=='production'){const{createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
 else{const dist=path.join(process.cwd(),'dist');app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
 app.listen(PORT,'0.0.0.0',()=>console.log(`Apki Sakhi server listening on port ${PORT}`));
}
startServer().catch(e=>{console.error('Server startup failed:',e);process.exit(1);});
