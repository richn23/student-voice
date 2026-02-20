"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, orderBy, Timestamp,
} from "firebase/firestore";

// ─── Languages ───
const LANGUAGES = [
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "fa", label: "Persian", native: "فارسی" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "th", label: "Thai", native: "ไทย" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
];

// ─── Types ───
interface DeploymentData {
  id: string;
  surveyId: string;
  versionId?: string;
  surveyVersionId?: string;
  label: string;
  status: string;
  deliveryMode?: string;
}

interface SurveyData {
  title: string;
  intro?: string;
  completionMessage?: string;
  languageSelectionEnabled?: boolean;
  toneProfile?: string;
  toneCustom?: string;
  description?: string;
}

interface QuestionData {
  id: string;
  qKey: string;
  type: string;
  prompt: Record<string, string>;
  section?: string;
  sectionId?: string;
  sectionTitle?: Record<string, string>;
  order: number;
  required?: boolean;
  config?: {
    min?: number;
    max?: number;
    lowLabel?: string;
    highLabel?: string;
    options?: string[];
    selectMode?: string;
  };
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  choices?: string[];
  multiChoices?: string[];
  widget?: { type: "scale"|"slider"|"nps"; min: number; max: number; lowLabel?: string; highLabel?: string };
}

type Phase = "loading" | "error" | "language" | "chat" | "complete";

// ─── Style palette (orange accent to match form runner) ───
const ORANGE = "#E8723A";
const ORANGE_LIGHT = "#F4A261";
const BG = "#EDEEF2";

// ─── Slider Widget ───
function SliderWidget({ min, max, onSubmit, disabled }: { min: number; max: number; onSubmit: (v: number) => void; disabled: boolean }) {
  const [val, setVal] = useState(Math.round((max - min) / 2));
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return null;

  return (
    <div style={{ marginBottom: 10, paddingLeft: 4, animation: "fadeSlide 0.3s ease" }}>
      <div style={{
        background: "rgba(255,255,255,0.9)", borderRadius: 16, padding: "14px 18px",
        border: `2px solid ${ORANGE}33`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        maxWidth: 280,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#888" }}>{min}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: ORANGE }}>{val}</span>
          <span style={{ fontSize: 11, color: "#888" }}>{max}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={val}
          onChange={(e) => setVal(parseInt(e.target.value))}
          disabled={disabled}
          style={{
            width: "100%", height: 6, appearance: "none", WebkitAppearance: "none",
            background: `linear-gradient(to right, ${ORANGE} ${((val - min) / (max - min)) * 100}%, #ddd ${((val - min) / (max - min)) * 100}%)`,
            borderRadius: 3, outline: "none", cursor: disabled ? "default" : "pointer",
          }}
        />
        <button
          onClick={() => { setSubmitted(true); onSubmit(val); }}
          disabled={disabled}
          style={{
            marginTop: 10, width: "100%", padding: "8px", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", borderRadius: 10, border: "none",
            background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`,
            color: "#fff", cursor: disabled ? "default" : "pointer",
            transition: "opacity 0.15s",
          }}
        >
          Submit
        </button>
      </div>
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 22px; height: 22px; border-radius: 50%;
          background: ${ORANGE}; border: 3px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 50%;
          background: ${ORANGE}; border: 3px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// ─── Main Component ───
export function ChatbotRunner({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [deployment, setDeployment] = useState<DeploymentData | null>(null);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [language, setLanguage] = useState("en");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [savedResponses, setSavedResponses] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatUi, setChatUi] = useState({
    thankYou: "Thank you!",
    defaultCompletion: "Your feedback has been submitted. It helps us improve your experience.",
    tapAll: "Tap all that apply, then press Done",
    done: "Done ✓",
    typeAnswer: "Type your answer...",
  });

  // Language picker state
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [customLang, setCustomLang] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    loadSurvey();
    setTimeout(() => setMounted(true), 100);
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ─── Load data ───
  async function loadSurvey() {
    try {
      const depSnap = await getDocs(
        query(collection(db, "deployments"), where("token", "==", token), where("status", "==", "live"))
      );
      if (depSnap.empty) { setError("This survey link is not active."); setPhase("error"); return; }

      const depDoc = depSnap.docs[0];
      const dep = { id: depDoc.id, ...depDoc.data() } as DeploymentData;
      setDeployment(dep);

      const versionId = dep.versionId || dep.surveyVersionId || "";
      const surveyDoc = await getDoc(doc(db, "surveys", dep.surveyId));
      if (!surveyDoc.exists()) { setError("Survey not found."); setPhase("error"); return; }
      const sData = surveyDoc.data();
      setSurvey({
        title: sData.title,
        intro: sData.intro || null,
        completionMessage: sData.completionMessage || null,
        languageSelectionEnabled: sData.languageSelectionEnabled !== false,
        toneProfile: sData.toneProfile || "friendly",
        toneCustom: sData.toneCustom || "",
        description: sData.description || "",
      });

      const qPath = `surveys/${dep.surveyId}/versions/${versionId}/questions`;
      const qSnap = await getDocs(query(collection(db, qPath), orderBy("order")));
      setQuestions(qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as QuestionData)));

      if (sData.languageSelectionEnabled === false) {
        startChatSession("en", dep, sData as SurveyData);
      } else {
        setPhase("language");
      }
    } catch (err) {
      console.error("Failed to load:", err);
      setError("Something went wrong."); setPhase("error");
    }
  }

  // ─── Start chat ───
  async function startChatSession(lang: string, dep?: DeploymentData, sData?: SurveyData) {
    const d = dep || deployment;
    const s = sData || survey;
    if (!d || !s) return;

    setLanguage(lang);

    // Translate UI strings for non-English
    if (lang !== "en") {
      try {
        const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang;
        const uiTexts = ["Thank you!", "Your feedback has been submitted. It helps us improve your experience.", "Tap all that apply, then press Done", "Done ✓", "Type your answer..."];
        const numbered = uiTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fast: true,
            system: `Translate each numbered line to ${langLabel}. Return ONLY the translations, one per line, numbered the same way. Keep it simple. Do not add anything else.`,
            messages: [{ role: "user", content: numbered }],
          }),
        });
        const data = await res.json();
        if (data.text) {
          const lines = data.text.split("\n").map((l: string) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
          const keys = ["thankYou", "defaultCompletion", "tapAll", "done", "typeAnswer"];
          const newUi = { ...chatUi };
          keys.forEach((k, i) => { if (lines[i]) (newUi as any)[k] = lines[i]; });
          setChatUi(newUi);
        }
        // Also translate completion message
        if (s.completionMessage) {
          const cRes = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fast: true,
              system: `Translate to ${langLabel}. Return ONLY the translation.`,
              messages: [{ role: "user", content: s.completionMessage }],
            }),
          });
          const cData = await cRes.json();
          if (cData.text?.trim()) setSurvey({ ...s, completionMessage: cData.text.trim() });
        }
      } catch (err) {
        console.error("Chat UI translation error:", err);
      }
    }

    const versionId = d.versionId || d.surveyVersionId || "";
    const sessionRef = await addDoc(collection(db, "sessions"), {
      surveyId: d.surveyId,
      surveyVersionId: versionId,
      deploymentId: d.id,
      language: lang,
      startedAt: Timestamp.now(),
      completedAt: null,
    });
    setSessionId(sessionRef.id);
    setPhase("chat");

    // Send first AI message
    const langName = lang === "en" ? "English" : LANGUAGES.find((l) => l.code === lang)?.label || lang;
    sendAIGreeting(lang, langName, s);
  }

  // ─── Build system prompt ───
  function buildSystemPrompt(lang: string): string {
    const langName = lang === "en" ? "English" : LANGUAGES.find((l) => l.code === lang)?.label || lang;
    const tone = survey?.toneProfile || "friendly";
    const toneInstructions: Record<string, string> = {
      friendly: "Be warm, casual, and encouraging. Add occasional emoji. Make it feel like chatting with a kind friend.",
      professional: "Be polite and respectful. Keep it clear and approachable.",
      simple: "Be very encouraging and patient. Use the simplest words possible.",
      custom: survey?.toneCustom || "Be helpful and friendly.",
    };

    const qList = questions.map((q, i) => {
      let desc = `Q${i + 1} [${q.qKey}] (${q.type}): Ask about: "${q.prompt.en}"`;
      if (q.type === "scale") desc += ` — score ${q.config?.min || 0} to ${q.config?.max || 3}`;
      if (q.type === "slider") desc += ` — number ${q.config?.min || 0} to ${q.config?.max || 100}`;
      if (q.type === "nps") desc += ` — number 0 to 10`;
      if (q.type === "multiple_choice") {
        const opts = (q.config?.options || []).join("|");
        if (q.config?.selectMode === "multi") {
          desc += ` — MUST include: <multichoices>${opts}</multichoices>`;
        } else {
          desc += ` — MUST include: <choices>${opts}</choices>`;
        }
      }
      if (q.type === "open_text") desc += ` — ask them to write`;
      desc += ` [Keep the SAME topic/meaning as the prompt - rephrase slightly in simple A2 English but do NOT change what the question is asking about. If it says "breakfast" ask about breakfast, not "today".]`;
      return desc;
    }).join("\n");

    return `You talk to students about school. Keep it VERY short.

STRICT RULES:
1. MAX 2 sentences. MAX 8 words each. NEVER more.
2. Say "Thanks!" or "OK! 😊" then ask next question. Nothing else.
3. Do NOT repeat their answer back to them.
4. Do NOT explain or add extra words.
5. Write in ${langName}.

GOOD examples:
- "Hi! 😊 Is your class nice?\n<widget type=\"scale\" min=\"0\" max=\"3\" />"
- "Thanks! Do you like the books?\n<widget type=\"scale\" min=\"0\" max=\"3\" />"
- "OK! 😊 What do you think?"
- "Got it! Is your teacher helpful?\n<widget type=\"scale\" min=\"0\" max=\"3\" />"

BAD examples (NEVER do this):
- "Thanks for sharing that! Now I'd like to ask about..." ❌
- "That's great to hear! The next question is about..." ❌
- "I appreciate your feedback. Let me ask you about the schedule and how suitable it is..." ❌

TONE: ${toneInstructions[tone] || toneInstructions.friendly}

HOW TO ASK — FOLLOW EXACTLY:
- scale: question text, then NEW line: <widget type="scale" min="0" max="3" />
- slider: question text, then: <widget type="slider" min="0" max="100" />
- NPS: question text, then: <widget type="nps" min="0" max="10" />
- single choice: question text, then: <choices>Option A|Option B</choices>
- multi choice: question text, then: <multichoices>Option A|Option B</multichoices>
- open text: just ask the question (no tag needed)
- CRITICAL: For multiple_choice questions you MUST include the <choices> or <multichoices> tag. TRANSLATE the option text into ${langName} inside the tag. Example: if English options are "Monday|Tuesday" and language is French, write <choices>Lundi|Mardi</choices>. Keep the same number of options.
- After ALL questions done: say thank you in ${langName}
- Do NOT write "(0-3)" or "(0-100)" in the text. The widget handles the input.

RESPONSE FORMAT:
After each student response, output a hidden tag with the parsed answer:
<response qKey="[qKey]" type="[type]" value="[parsed_value]" />

For scale: value is the number (0-${questions.find(q => q.type === "scale")?.config?.max || 3})
For slider: value is the number (0-100)  
For nps: value is the number (0-10)
For multiple_choice: value MUST be the ENGLISH option text from the question list above (not the translated version). Map the student's translated choice back to the English original.
For open_text: value is their full text response

If you can't parse a valid answer, ask for clarification. Do NOT include the tag if no valid answer was given.

QUESTIONS (ask ALL ${questions.length} in this exact order — do NOT skip any):
${qList}

IMPORTANT: 
- Start by greeting them and asking the FIRST question
- Only ask one question per message
- You MUST ask EVERY question in the list above. NEVER skip a question. There are exactly ${questions.length} questions - ask all ${questions.length}.
- The student might respond in ${langName} or English - understand both
- CRITICAL: You MUST ALWAYS include a <response> tag whenever the student gives ANY answer, even if it's just a number. Every answer needs a response tag. For example if they say "9" for an NPS question, you MUST output <response qKey="..." type="nps" value="9" />
- When all ${questions.length} questions are done, send a final thank you message with <survey_complete /> tag`;
  }

  // ─── AI interaction ───
  async function sendAIGreeting(lang: string, langName: string, sData: SurveyData) {
    setIsTyping(true);

    try {
      const systemPrompt = buildSystemPrompt(lang);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: "user", content: `[System: The student just started. Say hello in ${langName} and ask the first question. Keep it very short and simple. The survey is "${sData.title}"]` }],
          fast: true,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const cleaned = cleanAIResponse(data.text);
      const choices = extractChoices(data.text);
      const multiChoices = extractMultiChoices(data.text);
      const widget = extractWidget(data.text);
      setMessages([{ role: "assistant", content: cleaned, choices, multiChoices, widget }]);
    } catch (err) {
      console.error("AI greeting error:", err);
      setMessages([{ role: "assistant", content: "Hi! Let's get started with your feedback. How comfortable is the classroom? (0 = not at all, 3 = very comfortable)" }]);
    } finally {
      setIsTyping(false);
    }
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isTyping) return;

    const newUserMsg: ChatMessage = { role: "user", content: text };
    // Clear choices/widgets from all previous messages
    const cleanedPrev = messages.map((m) => ({ ...m, choices: undefined, widget: undefined }));
    const updatedMessages = [...cleanedPrev, newUserMsg];
    setMessages(updatedMessages);
    setInputText("");
    setIsTyping(true);

    try {
      // Build full conversation for API
      const systemPrompt = buildSystemPrompt(language);
      const apiMessages = [
        // Include the initial system greeting context
        { role: "user" as const, content: `[System: Say hello and ask the first question. Survey: "${survey?.title}"]` },
        ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: apiMessages, fast: true }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Parse response tags and save to Firestore
      await parseAndSaveResponses(data.text);

      // Check for completion
      if (data.text.includes("<survey_complete")) {
        const cleaned = cleanAIResponse(data.text);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
        await completeSurvey();
        return;
      }

      const cleaned = cleanAIResponse(data.text);
      const choices = extractChoices(data.text);
      const multiChoices = extractMultiChoices(data.text);
      const widget = extractWidget(data.text);
      setMessages((prev) => [...prev, { role: "assistant", content: cleaned, choices, multiChoices, widget }]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I had a moment there. Could you try saying that again?" }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  // ─── Parse AI response for answer tags ───
  async function parseAndSaveResponses(aiText: string) {
    const regex = /<response\s+qKey="([^"]+)"\s+type="([^"]+)"\s+value="([^"]*)"[^/]*\/>/g;
    let match;

    while ((match = regex.exec(aiText)) !== null) {
      const [, qKey, type, value] = match;
      if (savedResponses.has(qKey)) continue;

      const question = questions.find((q) => q.qKey === qKey);
      if (!question || !sessionId) continue;

      let responseData: any = {
        questionId: question.id,
        qKey,
        type,
        response: {},
        responseText: null,
        score: null,
        createdAt: Timestamp.now(),
      };

      if (type === "scale" || type === "nps" || type === "slider") {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          responseData.response = { value: num };
          responseData.score = num;
        }
      } else if (type === "multiple_choice") {
        responseData.response = { value };
      } else if (type === "open_text") {
        responseData.response = { text: value };
        responseData.responseText = value;
        // Translate to English if non-English
        if (language !== "en" && value.trim()) {
          try {
            const tRes = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fast: true,
                system: "Translate the following text to English. Return ONLY the translation, nothing else.",
                messages: [{ role: "user", content: value }],
              }),
            });
            const tData = await tRes.json();
            if (tData.text?.trim()) {
              responseData.responseText = tData.text.trim();
              responseData.responseOriginal = value;
              responseData.responseLanguage = language;
              responseData.response.textEnglish = tData.text.trim();
            }
          } catch {}
        }
      }

      try {
        await addDoc(collection(db, `sessions/${sessionId}/responses`), responseData);
        setSavedResponses((prev) => new Set(prev).add(qKey));
      } catch (err) {
        console.error("Failed to save response:", err);
      }
    }
  }

  // ─── Complete ───
  async function completeSurvey() {
    if (sessionId) {
      await updateDoc(doc(db, "sessions", sessionId), { completedAt: Timestamp.now() });
    }
    setTimeout(() => setPhase("complete"), 2000);
  }

  // ─── Clean AI text (remove hidden tags) ───
  function cleanAIResponse(text: string): string {
    return text
      .replace(/<response[^/]*\/>/g, "")
      .replace(/<survey_complete\s*\/>/g, "")
      .replace(/<choices>[^<]*<\/choices>/g, "")
      .replace(/<multichoices>[^<]*<\/multichoices>/g, "")
      .replace(/<widget[^/]*\/>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function extractChoices(text: string): string[] | undefined {
    const match = text.match(/<choices>([^<]*)<\/choices>/);
    if (!match) return undefined;
    return match[1].split("|").map((s) => s.trim()).filter(Boolean);
  }

  function extractMultiChoices(text: string): string[] | undefined {
    const match = text.match(/<multichoices>([^<]*)<\/multichoices>/);
    if (!match) return undefined;
    return match[1].split("|").map((s) => s.trim()).filter(Boolean);
  }

  function extractWidget(text: string): ChatMessage["widget"] | undefined {
    const match = text.match(/<widget\s+type="([^"]+)"\s+min="([^"]+)"\s+max="([^"]+)"(?:\s+lowLabel="([^"]*)")?(?:\s+highLabel="([^"]*)")?\s*\/>/);
    if (!match) return undefined;
    return {
      type: match[1] as "scale"|"slider"|"nps",
      min: parseInt(match[2]) || 0,
      max: parseInt(match[3]) || 3,
      lowLabel: match[4],
      highLabel: match[5],
    };
  }

  function sendChoice(choice: string) {
    sendInteractiveAnswer(choice);
  }

  function sendValue(value: number) {
    sendInteractiveAnswer(String(value));
  }

  function sendInteractiveAnswer(answer: string) {
    // Remove interactive elements from last message
    setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, choices: undefined, multiChoices: undefined, widget: undefined } : m));

    const newUserMsg: ChatMessage = { role: "user", content: answer };
    const cleanedPrev = messages.map((m) => ({ ...m, choices: undefined, multiChoices: undefined, widget: undefined }));
    const updatedMessages = [...cleanedPrev, newUserMsg];
    setMessages(updatedMessages);
    setIsTyping(true);

    const systemPrompt = buildSystemPrompt(language);
    const apiMessages = [
      { role: "user" as const, content: `[System: Say hello and ask the first question. Survey: "${survey?.title}"]` },
      ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt, messages: apiMessages, fast: true }),
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (data.error) throw new Error(data.error);
        await parseAndSaveResponses(data.text);
        if (data.text.includes("<survey_complete")) {
          const cleaned = cleanAIResponse(data.text);
          setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
          await completeSurvey();
          return;
        }
        const cleaned = cleanAIResponse(data.text);
        const choices = extractChoices(data.text);
        const multiChoices = extractMultiChoices(data.text);
        const widget = extractWidget(data.text);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned, choices, multiChoices, widget }]);
      })
      .catch(() => {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, could you try again?" }]);
      })
      .finally(() => {
        setIsTyping(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      });
  }

  // ─── Language selection handler ───
  function selectLanguage(lang: string) {
    startChatSession(lang);
  }

  // ─── Render ───
  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: BG,
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    opacity: mounted ? 1 : 0,
    transition: "opacity 0.4s ease",
  };

  // Loading
  if (phase === "loading") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${ORANGE}22`, borderTopColor: ORANGE, animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>😔</div>
          <p style={{ fontSize: 16, color: "#555", fontWeight: 500 }}>{error}</p>
        </div>
      </div>
    );
  }

  // Language selection (same design as form runner)
  if (phase === "language") {
    const filteredLangs = LANGUAGES.filter((l) =>
      l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.native.toLowerCase().includes(langSearch.toLowerCase())
    );

    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{
          maxWidth: 400, width: "90%", padding: 40, textAlign: "center",
          background: "rgba(255,255,255,0.7)", backdropFilter: "blur(40px) saturate(1.4)",
          borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          border: "1px solid rgba(255,255,255,0.5)",
        }}>
          {!showLangPicker && !showOtherInput && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Welcome</h1>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>{survey?.title || "Student Feedback"}</p>
              <button
                onClick={() => selectLanguage("en")}
                style={{
                  width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 600, color: "#fff",
                  background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`, border: "none",
                  borderRadius: 10, cursor: "pointer", fontFamily: "inherit", marginBottom: 16,
                  boxShadow: `0 4px 16px ${ORANGE}44`, transition: "transform 0.15s, box-shadow 0.15s",
                }}
              >
                Continue in English →
              </button>
              <button
                onClick={() => setShowLangPicker(true)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", fontFamily: "inherit" }}
              >
                🌍 Switch language
              </button>
            </>
          )}

          {showLangPicker && !showOtherInput && (
            <>
              <input
                autoFocus
                type="text"
                placeholder="Search languages..."
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #ddd",
                  borderRadius: 8, outline: "none", fontFamily: "inherit", marginBottom: 8,
                  background: "rgba(255,255,255,0.8)", boxSizing: "border-box",
                }}
              />
              <div style={{ maxHeight: 260, overflowY: "auto", textAlign: "left" }}>
                {filteredLangs.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => selectLanguage(lang.code)}
                    style={{
                      width: "100%", padding: "10px 14px", display: "flex", justifyContent: "space-between",
                      alignItems: "center", border: "none", background: "transparent", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 14, borderRadius: 6, transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = `${ORANGE}11`)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ color: "#1a1a1a" }}>{lang.native} <span style={{ color: "#999", fontSize: 12 }}>{lang.label}</span></span>
                    <span style={{ color: "#ccc" }}>→</span>
                  </button>
                ))}
                <button
                  onClick={() => setShowOtherInput(true)}
                  style={{
                    width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
                    border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 13, color: "#888", borderRadius: 6,
                  }}
                >
                  + Other language
                </button>
              </div>
              <button
                onClick={() => { setShowLangPicker(false); setLangSearch(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", fontFamily: "inherit", marginTop: 8 }}
              >
                ← Back to English
              </button>
            </>
          )}

          {showOtherInput && (
            <>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Tagalog, Swahili, Amharic..."
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && customLang.trim() && selectLanguage(customLang.trim())}
                style={{
                  width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #ddd",
                  borderRadius: 8, outline: "none", fontFamily: "inherit", marginBottom: 12,
                  background: "rgba(255,255,255,0.8)", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowOtherInput(false); setCustomLang(""); }}
                  style={{ flex: 1, padding: "10px", border: "1px solid #ddd", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#666" }}>
                  ← Back
                </button>
                <button onClick={() => customLang.trim() && selectLanguage(customLang.trim())}
                  style={{
                    flex: 1, padding: "10px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                    background: customLang.trim() ? `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})` : "#ddd",
                    color: customLang.trim() ? "#fff" : "#999", fontWeight: 600,
                  }}>
                  Continue →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Complete
  if (phase === "complete") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <div style={{
          maxWidth: 400, width: "90%", padding: 48, textAlign: "center",
          background: "rgba(255,255,255,0.7)", backdropFilter: "blur(40px) saturate(1.4)",
          borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          border: "1px solid rgba(255,255,255,0.5)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 20px ${ORANGE}44`,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>{chatUi.thankYou}</h2>
          <p style={{ fontSize: 14, color: "#666", lineHeight: 1.5 }}>
            {survey?.completionMessage || chatUi.defaultCompletion}
          </p>
        </div>
      </div>
    );
  }

  // Chat phase
  const progress = questions.length > 0 ? (savedResponses.size / questions.length) * 100 : 0;

  return (
    <div style={containerStyle}>
      {/* Progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.06)", zIndex: 100, marginTop: "env(safe-area-inset-top, 0px)" }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_LIGHT})`,
          transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: "0 2px 2px 0",
        }} />
      </div>

      {/* Header */}
      <div style={{
        padding: "12px 20px", paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(255,255,255,0.5)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 14, fontWeight: 700,
        }}>SV</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{survey?.title || "Feedback"}</div>
          <div style={{ fontSize: 11, color: "#999" }}>
            {savedResponses.size}/{questions.length} answered
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 100px" }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <div style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: (msg.choices || msg.multiChoices || msg.widget) ? 6 : 10,
              animation: "fadeSlide 0.3s ease",
            }}>
              <div style={{
                maxWidth: "82%", padding: "10px 14px", borderRadius: 14,
                fontSize: 14, lineHeight: 1.55, color: msg.role === "user" ? "#fff" : "#1a1a1a",
                background: msg.role === "user"
                  ? `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`
                  : "rgba(255,255,255,0.85)",
                boxShadow: msg.role === "user"
                  ? `0 2px 8px ${ORANGE}33`
                  : "0 1px 4px rgba(0,0,0,0.06)",
                border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.5)",
                ...(msg.role === "user"
                  ? { borderBottomRightRadius: 4 }
                  : { borderBottomLeftRadius: 4 }),
              }}>
                {msg.content}
              </div>
            </div>

            {/* Scale widget — row of number buttons */}
            {msg.widget && msg.widget.type === "scale" && (
              <div style={{ marginBottom: 10, paddingLeft: 4, animation: "fadeSlide 0.3s ease" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Array.from({ length: msg.widget.max - msg.widget.min + 1 }, (_, j) => j + msg.widget!.min).map((n) => (
                    <button key={n} onClick={() => sendValue(n)} disabled={isTyping}
                      style={{
                        width: 44, height: 44, fontSize: 16, fontWeight: 700, fontFamily: "inherit",
                        borderRadius: 12, border: `2px solid ${ORANGE}`,
                        background: "rgba(255,255,255,0.9)", color: ORANGE,
                        cursor: isTyping ? "default" : "pointer", transition: "all 0.15s",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      onMouseEnter={(e) => { if (!isTyping) { e.currentTarget.style.background = ORANGE; e.currentTarget.style.color = "#fff"; }}}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.9)"; e.currentTarget.style.color = ORANGE; }}
                    >{n}</button>
                  ))}
                </div>
              </div>
            )}

            {/* NPS widget — row of 0-10 buttons */}
            {msg.widget && msg.widget.type === "nps" && (
              <div style={{ marginBottom: 10, paddingLeft: 4, animation: "fadeSlide 0.3s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 3, maxWidth: 340 }}>
                  {Array.from({ length: 11 }, (_, j) => j).map((n) => {
                    const clr = n <= 6 ? "#e74c3c" : n <= 8 ? ORANGE : "#27ae60";
                    return (
                    <button key={n} onClick={() => sendValue(n)} disabled={isTyping}
                      style={{
                        height: 32, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                        borderRadius: 8, border: "none",
                        background: clr,
                        color: "#fff",
                        cursor: isTyping ? "default" : "pointer", transition: "all 0.15s",
                        boxShadow: `0 2px 6px ${clr}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0.85, padding: 0,
                      }}
                      onMouseEnter={(e) => { if (!isTyping) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1.1)"; }}}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "scale(1)"; }}
                    >{n}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Slider widget */}
            {msg.widget && msg.widget.type === "slider" && (
              <SliderWidget min={msg.widget.min} max={msg.widget.max} onSubmit={sendValue} disabled={isTyping} />
            )}

            {/* Choice buttons */}
            {msg.choices && msg.choices.length > 0 && (
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                marginBottom: 10, paddingLeft: 4,
                animation: "fadeSlide 0.3s ease",
              }}>
                {msg.choices.map((choice, ci) => (
                  <button
                    key={ci}
                    onClick={() => sendChoice(choice)}
                    disabled={isTyping}
                    style={{
                      padding: "8px 18px", fontSize: 14, fontFamily: "inherit",
                      fontWeight: 600, borderRadius: 20,
                      border: `2px solid ${ORANGE}`,
                      background: "rgba(255,255,255,0.9)",
                      color: ORANGE,
                      cursor: isTyping ? "default" : "pointer",
                      transition: "all 0.15s",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}
                    onMouseEnter={(e) => { if (!isTyping) { e.currentTarget.style.background = ORANGE; e.currentTarget.style.color = "#fff"; }}}
                    onMouseLeave={(e) => { e.currentTarget.style.background = multiSelected.includes(choice) ? ORANGE : "rgba(255,255,255,0.9)"; e.currentTarget.style.color = multiSelected.includes(choice) ? "#fff" : ORANGE; }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {/* Multi-select choices */}
            {msg.multiChoices && msg.multiChoices.length > 0 && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                marginBottom: 10, paddingLeft: 4,
                animation: "fadeSlide 0.3s ease",
              }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{chatUi.tapAll}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {msg.multiChoices.map((choice, ci) => {
                    const sel = multiSelected.includes(choice);
                    return (
                      <button
                        key={ci}
                        onClick={() => setMultiSelected((prev) => prev.includes(choice) ? prev.filter((c) => c !== choice) : [...prev, choice])}
                        disabled={isTyping}
                        style={{
                          padding: "8px 18px", fontSize: 14, fontFamily: "inherit",
                          fontWeight: 600, borderRadius: 20,
                          border: `2px solid ${ORANGE}`,
                          background: sel ? ORANGE : "rgba(255,255,255,0.9)",
                          color: sel ? "#fff" : ORANGE,
                          cursor: isTyping ? "default" : "pointer",
                          transition: "all 0.15s",
                          boxShadow: sel ? `0 2px 8px ${ORANGE}44` : "0 1px 4px rgba(0,0,0,0.06)",
                        }}
                      >
                        {sel ? "✓ " : ""}{choice}
                      </button>
                    );
                  })}
                </div>
                {multiSelected.length > 0 && (
                  <button
                    onClick={() => {
                      const answer = multiSelected.join(", ");
                      setMultiSelected([]);
                      sendInteractiveAnswer(answer);
                    }}
                    style={{
                      padding: "10px 24px", fontSize: 14, fontFamily: "inherit",
                      fontWeight: 700, borderRadius: 20,
                      border: "none",
                      background: `linear-gradient(135deg, ${ORANGE}, #F4A261)`,
                      color: "#fff",
                      cursor: "pointer",
                      alignSelf: "flex-start",
                      marginTop: 4,
                      boxShadow: `0 2px 8px ${ORANGE}44`,
                    }}
                  >
                    {chatUi.done}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
            <div style={{
              padding: "12px 18px", borderRadius: 14, borderBottomLeftRadius: 4,
              background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.5)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: "50%", background: "#ccc",
                    animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background: "rgba(255,255,255,0.8)", backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{
          display: "flex", gap: 8, maxWidth: 600, margin: "0 auto",
        }}>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={chatUi.typeAnswer}
            disabled={isTyping}
            style={{
              flex: 1, padding: "12px 16px", fontSize: 15, fontFamily: "inherit",
              border: "1px solid rgba(0,0,0,0.1)", borderRadius: 24,
              background: "rgba(255,255,255,0.9)", outline: "none",
              color: "#1a1a1a", transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = ORANGE)}
            onBlur={(e) => (e.target.style.borderColor = "rgba(0,0,0,0.1)")}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isTyping}
            style={{
              width: 44, height: 44, borderRadius: "50%", border: "none",
              background: inputText.trim() && !isTyping
                ? `linear-gradient(135deg, ${ORANGE}, ${ORANGE_LIGHT})`
                : "#ddd",
              cursor: inputText.trim() && !isTyping ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s, transform 0.15s",
              boxShadow: inputText.trim() ? `0 2px 8px ${ORANGE}33` : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={inputText.trim() ? "#fff" : "#aaa"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}