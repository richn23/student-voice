"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  Timestamp,
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
  surveyVersionId?: string; // backward compat
  label: string;
  status: string;
  deliveryMode?: string;
}

interface SurveyData {
  title: string;
  intro?: string;
  completionMessage?: string;
  languageSelectionEnabled?: boolean;
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

interface SectionGroup {
  key: string;
  title: Record<string, string>;
  questions: QuestionData[];
}

type Phase = "loading" | "error" | "language" | "intro" | "survey" | "complete";

// ─── Main Component ───
export function SurveyRunner({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [deployment, setDeployment] = useState<DeploymentData | null>(null);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [sections, setSections] = useState<SectionGroup[]>([]);
  const [language, setLanguage] = useState("en");
  const [sectionIdx, setSectionIdx] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [selectedMC, setSelectedMC] = useState<Record<string, number[]>>({});
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  const [mounted, setMounted] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [customLang, setCustomLang] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [uiStrings, setUiStrings] = useState<Record<string, string>>({
    sections: "sections", questions: "questions", toComplete: "to complete",
    begin: "Begin →", continue: "Continue →", submit: "Submit →", back: "← Back",
    thankYou: "Thank you", powered: "Powered by Student Voice",
    shareThoughts: "Share your thoughts...", selectAll: "Select all that apply", enterName: "Enter your name...",
    sectionOf: "of", section: "Section",
    defaultCompletion: "Your feedback helps us improve. Thank you for taking the time!",
  });

  useEffect(() => {
    loadSurvey();
    setTimeout(() => setMounted(true), 100);
  }, [token]);

  function transition(fn: () => void) {
    setFadeState("out");
    setTimeout(() => { fn(); setFadeState("in"); }, 280);
  }

  // ─── Load data ───
  async function loadSurvey() {
    try {
      // Find deployment
      const depSnap = await getDocs(
        query(collection(db, "deployments"), where("token", "==", token), where("status", "==", "live"))
      );
      if (depSnap.empty) { setError("This survey link is not active."); setPhase("error"); return; }

      const depDoc = depSnap.docs[0];
      const dep = { id: depDoc.id, ...depDoc.data() } as DeploymentData;
      setDeployment(dep);

      const versionId = dep.versionId || dep.surveyVersionId || "";

      // Load survey doc
      const surveyDoc = await getDoc(doc(db, "surveys", dep.surveyId));
      if (!surveyDoc.exists()) { setError("Survey not found."); setPhase("error"); return; }
      const sData = surveyDoc.data();
      setSurvey({
        title: sData.title,
        intro: sData.intro || null,
        completionMessage: sData.completionMessage || null,
        languageSelectionEnabled: sData.languageSelectionEnabled !== false,
      });

      // Load questions
      const qPath = `surveys/${dep.surveyId}/versions/${versionId}/questions`;
      const qSnap = await getDocs(query(collection(db, qPath), orderBy("order")));
      const allQuestions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() } as QuestionData));

      // Group by section
      const sectionMap = new Map<string, SectionGroup>();
      for (const q of allQuestions) {
        const key = q.sectionId || q.section || "default";
        const title = q.sectionTitle || { en: q.section || "Questions" };
        if (!sectionMap.has(key)) {
          sectionMap.set(key, { key, title, questions: [] });
        }
        sectionMap.get(key)!.questions.push(q);
      }
      setSections(Array.from(sectionMap.values()));

      // Skip language if disabled
      if (sData.languageSelectionEnabled === false) {
        setPhase("intro");
      } else {
        setPhase("language");
      }
    } catch (err) {
      console.error("Failed to load survey:", err);
      setError("Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  // ─── Start session ───
  async function startSession(lang: string) {
    if (!deployment) return;
    setLanguage(lang);

    // Translate content if non-English
    if (lang !== "en") {
      try {
        const langLabel = LANGUAGES.find((l) => l.code === lang)?.label || lang;
        const textsToTranslate: { key: string; text: string }[] = [];

        // Survey meta
        if (survey?.title) textsToTranslate.push({ key: "meta_title", text: survey.title });
        if (survey?.intro) textsToTranslate.push({ key: "meta_intro", text: survey.intro });
        if (survey?.completionMessage) textsToTranslate.push({ key: "meta_completion", text: survey.completionMessage });

        // UI strings
        const uiKeys = ["sections", "questions", "to complete", "Begin →", "Continue →", "Submit →", "← Back", "Thank you", "Powered by Student Voice", "Share your thoughts...", "Select all that apply", "Section", "of", "Your feedback helps us improve. Thank you for taking the time!", "Enter your name..."];
        uiKeys.forEach((text, i) => textsToTranslate.push({ key: `ui_${i}`, text }));

        // Collect section titles
        sections.forEach((sec, si) => {
          if (sec.title.en && !sec.title[lang]) {
            textsToTranslate.push({ key: `sec_${si}`, text: sec.title.en });
          }
        });

        // Collect question prompts, labels, and options
        sections.forEach((sec) => {
          sec.questions.forEach((q) => {
            if (q.prompt.en && !q.prompt[lang]) {
              textsToTranslate.push({ key: `q_${q.id}`, text: q.prompt.en });
            }
            if (q.config?.lowLabel) textsToTranslate.push({ key: `qlow_${q.id}`, text: q.config.lowLabel });
            if (q.config?.highLabel) textsToTranslate.push({ key: `qhigh_${q.id}`, text: q.config.highLabel });
            if (q.config?.options) {
              q.config.options.forEach((opt, oi) => {
                textsToTranslate.push({ key: `qopt_${q.id}_${oi}`, text: opt });
              });
            }
          });
        });

        if (textsToTranslate.length > 0) {
          const numbered = textsToTranslate.map((t, i) => `${i + 1}. ${t.text}`).join("\n");
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fast: true,
              system: `Translate each numbered line to ${langLabel}. Return ONLY the translations, one per line, numbered the same way. Keep it simple (A2/B1 level). Do not add anything else.`,
              messages: [{ role: "user", content: numbered }],
            }),
          });
          const data = await res.json();
          if (data.text) {
            // Parse by line number for robustness
            const lineMap = new Map<number, string>();
            data.text.split("\n").forEach((l: string) => {
              const m = l.match(/^(\d+)\.\s*(.*)/);
              if (m) lineMap.set(parseInt(m[1]), m[2].trim());
            });
            // Fallback: if no numbered lines found, use positional
            if (lineMap.size === 0) {
              data.text.split("\n").map((l: string) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).forEach((l: string, i: number) => lineMap.set(i + 1, l));
            }

            const translatedSurvey = { ...survey! };
            const newUi = { ...uiStrings };
            const updatedSections = [...sections];

            const translatedSurvey = { ...survey! };
            const newUi = { ...uiStrings };
            const updatedSections = [...sections];

            textsToTranslate.forEach((item, i) => {
              const translated = lineMap.get(i + 1);
              if (!translated) return;
              if (item.key === "meta_title") translatedSurvey.title = translated;
              else if (item.key === "meta_intro") translatedSurvey.intro = translated;
              else if (item.key === "meta_completion") translatedSurvey.completionMessage = translated;
              else if (item.key.startsWith("ui_")) {
                const uiIdx = parseInt(item.key.split("_")[1]);
                const uiMap = ["sections", "questions", "toComplete", "begin", "continue", "submit", "back", "thankYou", "powered", "shareThoughts", "selectAll", "section", "sectionOf", "defaultCompletion", "enterName"];
                if (uiMap[uiIdx]) newUi[uiMap[uiIdx]] = translated;
              }
              else if (item.key.startsWith("sec_")) {
                const si = parseInt(item.key.split("_")[1]);
                updatedSections[si].title[lang] = translated;
              } else if (item.key.startsWith("qlow_")) {
                const qId = item.key.slice(5);
                updatedSections.forEach((sec) => {
                  sec.questions.forEach((q) => {
                    if (q.id === qId && q.config) q.config.lowLabel = translated;
                  });
                });
              } else if (item.key.startsWith("qhigh_")) {
                const qId = item.key.slice(6);
                updatedSections.forEach((sec) => {
                  sec.questions.forEach((q) => {
                    if (q.id === qId && q.config) q.config.highLabel = translated;
                  });
                });
              } else if (item.key.startsWith("qopt_")) {
                const parts = item.key.split("_");
                const qId = parts[1];
                const optIdx = parseInt(parts[2]);
                updatedSections.forEach((sec) => {
                  sec.questions.forEach((q) => {
                    if (q.id === qId && q.config?.options) q.config.options[optIdx] = translated;
                  });
                });
              } else if (item.key.startsWith("q_")) {
                const qId = item.key.slice(2);
                updatedSections.forEach((sec) => {
                  sec.questions.forEach((q) => {
                    if (q.id === qId) q.prompt[lang] = translated;
                  });
                });
              }
            });

            setSurvey(translatedSurvey);
            setUiStrings(newUi);
            setSections(updatedSections);
          }
        }
      } catch (err) {
        console.error("Translation error (non-blocking):", err);
      }
    }

    const versionId = deployment.versionId || deployment.surveyVersionId || "";
    const sessionRef = await addDoc(collection(db, "sessions"), {
      surveyId: deployment.surveyId,
      surveyVersionId: versionId,
      deploymentId: deployment.id,
      language: lang,
      startedAt: Timestamp.now(),
      completedAt: null,
    });
    setSessionId(sessionRef.id);
    transition(() => setPhase("intro"));
  }

  function startSurvey() { transition(() => setPhase("survey")); }

  // ─── Save & navigate ───
  async function saveAndNext() {
    if (!sessionId) return;

    const sec = sections[sectionIdx];

    // Collect open text answers that need translation (skip name field)
    const textsToTranslate: { qId: string; text: string }[] = [];
    if (language !== "en") {
      for (const q of sec.questions) {
        if ((q.type === "open_text" || q.type === "text") && answers[q.id]?.trim() && q.qKey !== "student_name") {
          textsToTranslate.push({ qId: q.id, text: answers[q.id].trim() });
        }
      }
    }

    // Batch translate if needed
    const translations = new Map<string, string>();
    if (textsToTranslate.length > 0) {
      try {
        const numbered = textsToTranslate.map((t, i) => `${i + 1}. ${t.text}`).join("\n");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fast: true,
            system: "Translate each numbered line to English. Return ONLY the English translations, one per line, numbered the same way. Do not add anything else.",
            messages: [{ role: "user", content: numbered }],
          }),
        });
        const data = await res.json();
        if (data.text) {
          const lines = data.text.split("\n").map((l: string) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
          textsToTranslate.forEach((item, i) => {
            if (lines[i]) translations.set(item.qId, lines[i]);
          });
        }
      } catch (err) {
        console.error("Translation error (non-blocking):", err);
      }
    }

    // Save all responses for this section
    for (const q of sec.questions) {
      let responseData: any = {
        questionId: q.id,
        qKey: q.qKey,
        type: q.type,
        response: {},
        responseText: null,
        score: null,
        createdAt: Timestamp.now(),
      };

      if (q.type === "scale" || q.type === "nps") {
        const val = answers[q.id];
        if (val !== undefined) {
          responseData.response = { value: val };
          responseData.score = Number(val);
        }
      } else if (q.type === "slider") {
        const val = sliderValues[q.id] ?? 50;
        responseData.response = { value: val };
        responseData.score = val;
      } else if (q.type === "multiple_choice") {
        const indices = selectedMC[q.id] || [];
        if (indices.length > 0 && q.config?.options) {
          const values = indices.map((idx) => q.config!.options![idx]);
          responseData.response = { value: values.length === 1 ? values[0] : values, indices };
          responseData.score = null;
        }
      } else if (q.type === "open_text" || q.type === "text") {
        const text = answers[q.id] || "";
        const englishText = translations.get(q.id);
        responseData.response = { text, ...(englishText ? { textEnglish: englishText } : {}) };
        responseData.responseText = englishText || text || null;
        if (englishText && text !== englishText) {
          responseData.responseOriginal = text;
          responseData.responseLanguage = language;
        }
      }

      await addDoc(collection(db, `sessions/${sessionId}/responses`), responseData);
    }

    // Next section or complete
    if (sectionIdx < sections.length - 1) {
      transition(() => setSectionIdx((i) => i + 1));
    } else {
      // Build response summary for session doc
      const responseSummary: Record<string, any> = {};
      for (const sec of sections) {
        for (const q of sec.questions) {
          const entry: any = { qKey: q.qKey, type: q.type, prompt: q.prompt.en || q.prompt[Object.keys(q.prompt)[0]] || "" };
          if (q.type === "scale" || q.type === "nps") {
            entry.value = answers[q.id] !== undefined ? Number(answers[q.id]) : null;
            entry.max = q.config?.max || (q.type === "nps" ? 10 : 3);
          } else if (q.type === "slider") {
            entry.value = sliderValues[q.id] ?? null;
            entry.max = q.config?.max || 100;
          } else if (q.type === "multiple_choice") {
            const indices = selectedMC[q.id] || [];
            if (indices.length > 0 && q.config?.options) {
              const values = indices.map((idx) => q.config!.options![idx]);
              entry.value = values.length === 1 ? values[0] : values;
            } else {
              entry.value = null;
            }
          } else if (q.type === "open_text" || q.type === "text") {
            entry.value = answers[q.id] || null;
          }
          responseSummary[q.qKey] = entry;
        }
      }

      // Complete session with summary
      await updateDoc(doc(db, "sessions", sessionId), {
        completedAt: Timestamp.now(),
        responseSummary,
      });
      transition(() => setPhase("complete"));
    }
  }

  function prevSection() {
    if (sectionIdx > 0) transition(() => setSectionIdx((i) => i - 1));
  }

  function setAnswer(qId: string, val: any) { setAnswers((p) => ({ ...p, [qId]: val })); }
  function setSlider(qId: string, val: number) { setSliderValues((p) => ({ ...p, [qId]: val })); }
  function setMC(qId: string, val: number, multi: boolean) {
    setSelectedMC((p) => {
      const curr = p[qId] || [];
      if (multi) {
        return { ...p, [qId]: curr.includes(val) ? curr.filter((v) => v !== val) : [...curr, val] };
      }
      return { ...p, [qId]: curr.includes(val) ? [] : [val] };
    });
  }

  function t(textMap: Record<string, string> | undefined): string {
    if (!textMap) return "";
    return textMap[language] || textMap["en"] || Object.values(textMap)[0] || "";
  }

  const progressPct = phase === "survey" ? ((sectionIdx + 1) / sections.length) * 100 : 0;
  const currentSection = sections[sectionIdx];
  const totalQ = sections.reduce((s, sec) => s + sec.questions.length, 0);

  const fadeStyle: React.CSSProperties = {
    opacity: fadeState === "in" && mounted ? 1 : 0,
    transform: fadeState === "in" && mounted ? "translateY(0)" : "translateY(12px)",
    transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  // ═══════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════
  if (phase === "loading") {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 14, color: "#999" }}>Loading survey...</div>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════
  // ERROR
  // ═══════════════════════════════════════
  if (phase === "error") {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 15, color: "#666" }}>{error}</div>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════
  // LANGUAGE
  // ═══════════════════════════════════════
  if (phase === "language") {
    const filteredLangs = langSearch
      ? LANGUAGES.filter((l) => l.label.toLowerCase().includes(langSearch.toLowerCase()) || l.native.toLowerCase().includes(langSearch.toLowerCase()))
      : LANGUAGES;

    return (
      <Shell>
        <div style={{ ...fadeStyle, maxWidth: 420, margin: "0 auto" }}>
          {/* Logo */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 28px",
            background: "linear-gradient(135deg, #E8723A 0%, #F4A261 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 32px rgba(232,114,58,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
            position: "relative",
          }}>
            <span style={{ color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>SV</span>
            <div style={{
              position: "absolute", inset: -1, borderRadius: 17,
              background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
              pointerEvents: "none",
            }} />
          </div>

          <GlassCard>
            <div style={{ padding: "36px 28px", textAlign: "center" }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Welcome
              </h1>
              <p style={{ fontSize: 14, color: "#888", margin: "0 0 32px" }}>
                Your feedback is anonymous and takes about 5 minutes
              </p>

              {/* English default — Continue button */}
              {!showLangPicker && !showOtherInput && (
                <div>
                  <OrangeButton onClick={() => startSession("en")} label="Continue in English →" fullWidth />

                  <button
                    onClick={() => setShowLangPicker(true)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      width: "100%", padding: "14px 0", marginTop: 12,
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 14, fontWeight: 500, color: "#888",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#E8723A"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                    Switch language
                  </button>
                </div>
              )}

              {/* Language picker dropdown */}
              {showLangPicker && !showOtherInput && (
                <div>
                  {/* Search */}
                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#aaa" strokeWidth="2"
                      style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search languages..."
                      value={langSearch}
                      onChange={(e) => setLangSearch(e.target.value)}
                      autoFocus
                      style={{
                        width: "100%", padding: "12px 14px 12px 40px",
                        fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif",
                        borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.02)", color: "#2a2a2a",
                        outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#E8723A"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
                    />
                  </div>

                  {/* Language list */}
                  <div style={{
                    maxHeight: 260, overflowY: "auto", borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.01)",
                  }}>
                    {filteredLangs.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => startSession(l.code)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          width: "100%", padding: "12px 16px",
                          background: "none", border: "none", cursor: "pointer",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          borderBottom: "1px solid rgba(0,0,0,0.04)",
                          transition: "background 0.15s", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,114,58,0.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#2a2a2a" }}>{l.native}</div>
                          <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>{l.label}</div>
                        </div>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ccc" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    ))}

                    {filteredLangs.length === 0 && !langSearch && null}

                    {/* Other language option */}
                    <button
                      onClick={() => { setShowOtherInput(true); setShowLangPicker(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        width: "100%", padding: "12px 16px",
                        background: "none", border: "none", cursor: "pointer",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        textAlign: "left", transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,114,58,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      <div style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: "rgba(0,0,0,0.06)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#888" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>Other language</div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>Type your language</div>
                      </div>
                    </button>
                  </div>

                  {/* Back to English */}
                  <button
                    onClick={() => { setShowLangPicker(false); setLangSearch(""); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      width: "100%", padding: "12px 0", marginTop: 8,
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: 500, color: "#aaa",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    ← Back to English
                  </button>
                </div>
              )}

              {/* Other language text input */}
              {showOtherInput && (
                <div>
                  <p style={{ fontSize: 14, color: "#555", margin: "0 0 12px" }}>
                    Type your preferred language
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. Tagalog, Swahili, Amharic..."
                    value={customLang}
                    onChange={(e) => setCustomLang(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%", padding: "14px 16px",
                      fontSize: 15, fontFamily: "'DM Sans', system-ui, sans-serif",
                      borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
                      background: "rgba(0,0,0,0.02)", color: "#2a2a2a",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#E8723A"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
                    onKeyDown={(e) => { if (e.key === "Enter" && customLang.trim()) startSession(customLang.trim().toLowerCase()); }}
                  />

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => { setShowOtherInput(false); setShowLangPicker(true); setCustomLang(""); }}
                      style={{
                        flex: 1, padding: "14px 0", borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.6)",
                        color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      ← Back
                    </button>
                    <div style={{ flex: 2 }}>
                      <OrangeButton
                        onClick={() => { if (customLang.trim()) startSession(customLang.trim().toLowerCase()); }}
                        label="Continue →"
                        fullWidth
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

          <p style={{ fontSize: 11, color: "#aaa", marginTop: 24, textAlign: "center" }}>
            All responses are completely anonymous
          </p>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════
  // INTRO
  // ═══════════════════════════════════════
  if (phase === "intro") {
    return (
      <Shell>
        <div style={{ ...fadeStyle, maxWidth: 420, margin: "0 auto" }}>
          <GlassCard>
            <div style={{ padding: "36px 28px", textAlign: "center" }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, margin: "0 auto 24px",
                background: "rgba(232,114,58,0.08)", border: "1px solid rgba(232,114,58,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#E8723A" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>

              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                {survey?.title || "Student Feedback"}
              </h2>
              <p style={{ fontSize: 14, color: "#777", margin: "0 0 32px", lineHeight: 1.7 }}>
                {survey?.intro || "Your feedback helps us improve. All answers are anonymous."}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
                {[
                  { val: sections.length, label: uiStrings.sections },
                  { val: totalQ, label: uiStrings.questions },
                  { val: "~5m", label: uiStrings.toComplete },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: "16px 8px", background: "rgba(0,0,0,0.02)",
                    borderRadius: 8, border: "1px solid rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#2a2a2a", lineHeight: 1 }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <OrangeButton onClick={startSurvey} label={uiStrings.begin} />
            </div>
          </GlassCard>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════
  // SURVEY
  // ═══════════════════════════════════════
  if (phase === "survey" && currentSection) {
    return (
      <Shell showProgress progressPct={progressPct}>
        <div style={{ ...fadeStyle, maxWidth: 480, margin: "0 auto", width: "100%" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, padding: "0 4px" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#E8723A", marginBottom: 4 }}>
                {uiStrings.section} {sectionIdx + 1} {uiStrings.sectionOf} {sections.length}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.02em" }}>
                {t(currentSection.title)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, paddingBottom: 6 }}>
              {sections.map((_, i) => (
                <div key={i} style={{
                  width: i === sectionIdx ? 20 : 6, height: 6, borderRadius: 3,
                  background: i === sectionIdx ? "linear-gradient(90deg, #E8723A, #F4A261)" : i < sectionIdx ? "#E8723A" : "rgba(0,0,0,0.1)",
                  transition: "all 0.3s ease",
                }} />
              ))}
            </div>
          </div>

          {/* Questions */}
          <GlassCard noPad>
            {currentSection.questions.map((q, qi) => (
              <div key={q.id} style={{
                padding: "24px 28px",
                borderBottom: qi < currentSection.questions.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: answers[q.id] !== undefined || sliderValues[q.id] !== undefined || (selectedMC[q.id] && selectedMC[q.id].length > 0)
                      ? "linear-gradient(135deg, #E8723A, #F4A261)" : "rgba(0,0,0,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s ease",
                  }}>
                    {(answers[q.id] !== undefined || sliderValues[q.id] !== undefined || (selectedMC[q.id] && selectedMC[q.id].length > 0)) ? (
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#999" }}>{qi + 1}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#2a2a2a", lineHeight: 1.5 }}>
                    {t(q.prompt)}
                  </div>
                </div>

                {/* SCALE */}
                {q.type === "scale" && (
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {Array.from({ length: ((q.config?.max ?? 3) - (q.config?.min ?? 0)) + 1 }, (_, i) => {
                        const val = (q.config?.min ?? 0) + i;
                        const selected = answers[q.id] === val;
                        return (
                          <button key={val} onClick={() => setAnswer(q.id, val)} style={{
                            flex: 1, padding: "14px 0", borderRadius: 10, border: "none",
                            fontSize: 16, fontWeight: 700, cursor: "pointer",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                            background: selected ? "linear-gradient(135deg, #E8723A, #F4A261)" : "rgba(0,0,0,0.04)",
                            color: selected ? "#fff" : "#666",
                            boxShadow: selected ? "0 4px 16px rgba(232,114,58,0.3)" : "none",
                            transform: selected ? "scale(1.08)" : "scale(1)",
                          }}>{val}</button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "0 2px" }}>
                      <span style={{ fontSize: 10, color: "#aaa", fontWeight: 500 }}>{q.config?.lowLabel || ""}</span>
                      <span style={{ fontSize: 10, color: "#aaa", fontWeight: 500 }}>{q.config?.highLabel || ""}</span>
                    </div>
                  </div>
                )}

                {/* SLIDER */}
                {q.type === "slider" && (
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <span style={{
                        fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em",
                        background: "linear-gradient(135deg, #E8723A, #F4A261)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      }}>{sliderValues[q.id] ?? 50}</span>
                    </div>
                    <div style={{ position: "relative", height: 32, display: "flex", alignItems: "center" }}>
                      <div style={{ position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.06)" }} />
                      <div style={{ position: "absolute", left: 0, height: 6, borderRadius: 3, width: `${sliderValues[q.id] ?? 50}%`, background: "linear-gradient(90deg, #E8723A, #F4A261)" }} />
                      <input type="range" min={0} max={100} value={sliderValues[q.id] ?? 50}
                        onChange={(e) => setSlider(q.id, Number(e.target.value))}
                        style={{ position: "relative", width: "100%", height: 32, appearance: "none", background: "transparent", cursor: "pointer", zIndex: 2 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#aaa", fontWeight: 500 }}>{q.config?.lowLabel || "0"}</span>
                      <span style={{ fontSize: 10, color: "#aaa", fontWeight: 500 }}>{q.config?.highLabel || "100"}</span>
                    </div>
                  </div>
                )}

                {/* NPS */}
                {q.type === "nps" && (
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 4 }}>
                      {Array.from({ length: 11 }, (_, i) => {
                        const selected = answers[q.id] === i;
                        const clr = i <= 6 ? "#e74c3c" : i <= 8 ? "#E8723A" : "#27ae60";
                        return (
                          <button key={i} onClick={() => setAnswer(q.id, i)} style={{
                            padding: "12px 0", borderRadius: 8, border: "none",
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            transition: "all 0.2s ease",
                            background: selected ? clr : `${clr}18`,
                            color: selected ? "#fff" : clr,
                            boxShadow: selected ? `0 4px 12px ${clr}44` : "none",
                            transform: selected ? "scale(1.1)" : "scale(1)",
                          }}>{i}</button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 500 }}>{q.config?.lowLabel || "Not likely"}</span>
                      <span style={{ fontSize: 10, color: "#27ae60", fontWeight: 500 }}>{q.config?.highLabel || "Very likely"}</span>
                    </div>
                  </div>
                )}

                {/* MULTIPLE CHOICE */}
                {q.type === "multiple_choice" && (
                  <div style={{ paddingLeft: 32, display: "flex", flexDirection: "column", gap: 6 }}>
                    {q.config?.selectMode === "multi" && (
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{uiStrings.selectAll}</div>
                    )}
                    {(q.config?.options || []).map((opt, oi) => {
                      const isMulti = q.config?.selectMode === "multi";
                      const selected = (selectedMC[q.id] || []).includes(oi);
                      return (
                        <button key={oi} onClick={() => setMC(q.id, oi, isMulti)} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "14px 16px", borderRadius: 10, border: "none",
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          cursor: "pointer", textAlign: "left", transition: "all 0.2s ease",
                          background: selected ? "linear-gradient(135deg, rgba(232,114,58,0.1), rgba(244,162,97,0.06))" : "rgba(0,0,0,0.025)",
                          boxShadow: selected ? "inset 0 0 0 2px #E8723A" : "inset 0 0 0 1px rgba(0,0,0,0.06)",
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: isMulti ? 4 : "50%", flexShrink: 0,
                            border: `2px solid ${selected ? "#E8723A" : "#ccc"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: selected && isMulti ? "#E8723A" : "transparent",
                          }}>
                            {selected && !isMulti && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "linear-gradient(135deg, #E8723A, #F4A261)" }} />}
                            {selected && isMulti && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: selected ? 600 : 400, color: selected ? "#2a2a2a" : "#555" }}>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* OPEN TEXT */}
                {(q.type === "open_text" || q.type === "text") && (
                  <div style={{ paddingLeft: 32 }}>
                    <textarea
                      placeholder={q.qKey === "student_name" ? (uiStrings.enterName || "Enter your name...") : uiStrings.shareThoughts}
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      style={{
                        width: "100%", minHeight: q.qKey === "student_name" ? 44 : 88, padding: "14px 16px",
                        fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif",
                        borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.5)", color: "#2a2a2a",
                        outline: "none", resize: q.qKey === "student_name" ? "none" : "vertical", boxSizing: "border-box",
                        transition: "all 0.2s ease",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#E8723A"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,114,58,0.1)"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; e.currentTarget.style.boxShadow = "none"; }}
                    />
                  </div>
                )}
              </div>
            ))}
          </GlassCard>

          {/* Nav */}
          <div style={{ display: "flex", gap: 10, marginTop: 20, marginBottom: 40 }}>
            {sectionIdx > 0 && (
              <button onClick={prevSection} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "14px 20px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)",
                background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)",
                color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}>{uiStrings.back}</button>
            )}
            <div style={{ flex: 1 }}>
              <OrangeButton onClick={saveAndNext} label={sectionIdx < sections.length - 1 ? uiStrings.continue : uiStrings.submit} fullWidth />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════
  // COMPLETE
  // ═══════════════════════════════════════
  if (phase === "complete") {
    return (
      <Shell>
        <div style={{ ...fadeStyle, maxWidth: 420, margin: "0 auto" }}>
          <GlassCard>
            <div style={{ padding: "48px 28px", textAlign: "center" }}>
              <div style={{
                width: 72, height: 72, borderRadius: 22, margin: "0 auto 28px",
                background: "linear-gradient(135deg, #E8723A 0%, #F4A261 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 8px 40px rgba(232,114,58,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                animation: "completePop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}>
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
                {uiStrings.thankYou}
              </h2>
              <p style={{ fontSize: 15, color: "#777", margin: 0, lineHeight: 1.7 }}>
                {survey?.completionMessage || uiStrings.defaultCompletion}
              </p>

              <div style={{
                marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: "linear-gradient(135deg, #E8723A, #F4A261)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(232,114,58,0.2)",
                }}>
                  <span style={{ color: "#fff", fontSize: 8, fontWeight: 800 }}>SV</span>
                </div>
                <span style={{ fontSize: 12, color: "#bbb", fontWeight: 500 }}>{uiStrings.powered}</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </Shell>
    );
  }

  return null;
}

// ─── Shared Components ───

function Shell({ children, showProgress, progressPct }: { children: React.ReactNode; showProgress?: boolean; progressPct?: number }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#EDEEF2",
      backgroundImage: `
        radial-gradient(ellipse at 25% 0%, rgba(232,114,58,0.07) 0%, transparent 60%),
        radial-gradient(ellipse at 75% 100%, rgba(232,114,58,0.05) 0%, transparent 60%),
        radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 70%)
      `,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 20px", paddingTop: showProgress ? 12 : 56,
    }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.4,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
      }} />

      {showProgress && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 100 }}>
          <div style={{
            height: "100%", width: `${progressPct}%`,
            background: "linear-gradient(90deg, #E8723A, #F4A261)",
            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 0 12px rgba(232,114,58,0.4)",
          }} />
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>{children}</div>

      <style>{`
        @keyframes completePop {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, #E8723A, #F4A261);
          border: 3px solid white;
          box-shadow: 0 2px 12px rgba(232,114,58,0.3);
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, #E8723A, #F4A261);
          border: 3px solid white;
          box-shadow: 0 2px 12px rgba(232,114,58,0.3);
          cursor: pointer;
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

function GlassCard({ children, noPad }: { children: React.ReactNode; noPad?: boolean }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.55)",
      backdropFilter: "blur(40px) saturate(1.4)",
      WebkitBackdropFilter: "blur(40px) saturate(1.4)",
      border: "1px solid rgba(255,255,255,0.6)",
      borderRadius: 16,
      boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)",
      padding: noPad ? 0 : undefined,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%)",
        pointerEvents: "none",
      }} />
      {children}
    </div>
  );
}

function OrangeButton({ onClick, label, fullWidth }: { onClick: () => void; label: string; fullWidth?: boolean }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      width: fullWidth ? "100%" : "auto",
      padding: "16px 32px", borderRadius: 12, border: "none",
      background: "linear-gradient(135deg, #E8723A 0%, #F4A261 100%)",
      color: "#fff", fontSize: 16, fontWeight: 700,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      cursor: "pointer", transition: "all 0.2s ease",
      boxShadow: "0 4px 20px rgba(232,114,58,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(232,114,58,0.4), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(232,114,58,0.3), inset 0 1px 0 rgba(255,255,255,0.2)"; }}
    >{label}</button>
  );
}