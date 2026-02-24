"use client";

import { useState, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useTheme } from "@/components/theme-provider";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Plus,
  Trash2,
  Copy,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Globe,
  Sparkles,
  Users,
} from "lucide-react";

// ─── Types ───
type QuestionType = "scale" | "slider" | "multiple_choice" | "open_text" | "nps";
type ToneProfile = "friendly" | "professional" | "simple" | "custom";
type Step = 1 | 2 | 3 | 4;

interface QuestionConfig {
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  options?: string[];
  selectMode?: "single" | "multi";
}

interface BuilderQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  config: QuestionConfig;
}

interface BuilderSection {
  id: string;
  title: string;
  questions: BuilderQuestion[];
  collapsed: boolean;
}

interface SurveySetup {
  title: string;
  slug: string;
  description: string;
  toneProfile: ToneProfile;
  toneCustom: string;
  languageSelectionEnabled: boolean;
  intro: string;
  completionMessage: string;
  responseMode: "anonymous" | "named";
}

// ─── Style helpers ───
function glassStyle(dark: boolean): React.CSSProperties {
  return {
    background: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.4)",
    borderRadius: "2px",
    boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.06)",
  };
}

function headerStyle(dark: boolean): React.CSSProperties {
  return {
    background: dark ? "rgba(30,30,30,0.85)" : "#ffffff",
    borderBottom: dark ? "1px solid #333" : "1px solid #d4d4d4",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };
}

function accentBg(dark: boolean) { return dark ? "#4da6ff" : "#0078d4"; }
function accentHoverBg(dark: boolean) { return dark ? "#3d96ef" : "#106ebe"; }

function textColor(dark: boolean, level: "primary" | "secondary" | "tertiary") {
  return ({ primary: dark ? "#eaeaea" : "#1a1a1a", secondary: dark ? "#a0a0a0" : "#555555", tertiary: dark ? "#606060" : "#8a8a8a" })[level];
}

function inputStyle(dark: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
    border: `1px solid ${dark ? "#333" : "#d4d4d4"}`,
    borderRadius: 2,
    color: textColor(dark, "primary"),
    outline: "none",
    transition: "border-color 0.15s",
  };
}

function selectStyle(dark: boolean): React.CSSProperties {
  return { ...inputStyle(dark), cursor: "pointer" };
}

function btnPrimary(dark: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px",
    background: accentBg(dark), color: "#fff", borderRadius: 2, fontSize: 13,
    fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit",
    transition: "background 0.15s",
  };
}

function btnSecondary(dark: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px",
    background: "transparent", color: textColor(dark, "secondary"), borderRadius: 2,
    fontSize: 13, fontWeight: 600, border: `1px solid ${dark ? "#333" : "#d4d4d4"}`,
    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
  };
}

function btnSmall(dark: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px",
    background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: textColor(dark, "secondary"),
    borderRadius: 2, fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", fontFamily: "inherit",
  };
}

function labelStyle(dark: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: textColor(dark, "secondary"), marginBottom: 4, display: "block" };
}

function microLabel(dark: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: textColor(dark, "tertiary") };
}

// ─── Helpers ───
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 60);
}

function generateToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  scale: "Scale",
  slider: "Slider (0–100)",
  multiple_choice: "Multiple Choice",
  open_text: "Open Text",
  nps: "NPS (0–10)",
};

const TONE_LABELS: Record<ToneProfile, string> = {
  friendly: "Friendly & casual",
  professional: "Professional & formal",
  simple: "Simple & encouraging",
  custom: "Custom",
};

function defaultConfig(type: QuestionType): QuestionConfig {
  switch (type) {
    case "scale": return { min: 0, max: 3, lowLabel: "Strongly disagree", highLabel: "Strongly agree" };
    case "slider": return { min: 0, max: 100, lowLabel: "Low", highLabel: "High" };
    case "multiple_choice": return { options: ["Option 1", "Option 2"], selectMode: "single" };
    case "nps": return { min: 0, max: 10, lowLabel: "Not at all likely", highLabel: "Extremely likely" };
    case "open_text": return {};
  }
}

function newQuestion(type: QuestionType): BuilderQuestion {
  return {
    id: generateId(),
    type,
    prompt: type === "nps" ? "How likely are you to recommend this class to a friend?" : "",
    required: true,
    config: defaultConfig(type),
  };
}

function newSection(): BuilderSection {
  return { id: generateId(), title: "", questions: [], collapsed: false };
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export function SurveyBuilder() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  const [step, setStep] = useState<Step>(1);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Step 1 — Setup
  const [setup, setSetup] = useState<SurveySetup>({
    title: "",
    slug: "",
    description: "",
    toneProfile: "friendly",
    toneCustom: "",
    languageSelectionEnabled: true,
    intro: "",
    completionMessage: "",
    responseMode: "anonymous",
  });

  // Step 2 — Sections + Questions
  const [sections, setSections] = useState<BuilderSection[]>([newSection()]);

  // ─── Setup helpers ───
  function updateSetup(key: keyof SurveySetup, value: any) {
    setSetup((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title") next.slug = slugify(value);
      return next;
    });
  }

  // ─── Section helpers ───
  function updateSection(sectionId: string, key: keyof BuilderSection, value: any) {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, [key]: value } : s));
  }

  function removeSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }

  function addSection() {
    setSections((prev) => [...prev, newSection()]);
  }

  // ─── Question helpers ───
  function addQuestion(sectionId: string, type: QuestionType) {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId ? { ...s, questions: [...s.questions, newQuestion(type)] } : s
    ));
  }

  function updateQuestion(sectionId: string, questionId: string, updates: Partial<BuilderQuestion>) {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId
        ? { ...s, questions: s.questions.map((q) => q.id === questionId ? { ...q, ...updates } : q) }
        : s
    ));
  }

  function updateQuestionConfig(sectionId: string, questionId: string, configUpdates: Partial<QuestionConfig>) {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId
        ? { ...s, questions: s.questions.map((q) => q.id === questionId ? { ...q, config: { ...q.config, ...configUpdates } } : q) }
        : s
    ));
  }

  function removeQuestion(sectionId: string, questionId: string) {
    setSections((prev) => prev.map((s) =>
      s.id === sectionId ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) } : s
    ));
  }

  function duplicateQuestion(sectionId: string, questionId: string) {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const idx = s.questions.findIndex((q) => q.id === questionId);
      if (idx === -1) return s;
      const dupe = { ...s.questions[idx], id: generateId(), prompt: s.questions[idx].prompt + " (copy)", config: { ...s.questions[idx].config } };
      const newQs = [...s.questions];
      newQs.splice(idx + 1, 0, dupe);
      return { ...s, questions: newQs };
    }));
  }

  function moveQuestion(sectionId: string, questionId: string, direction: "up" | "down") {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const idx = s.questions.findIndex((q) => q.id === questionId);
      if (idx === -1) return s;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= s.questions.length) return s;
      const newQs = [...s.questions];
      [newQs[idx], newQs[swap]] = [newQs[swap], newQs[idx]];
      return { ...s, questions: newQs };
    }));
  }

  // MC option helpers
  function addOption(sectionId: string, questionId: string) {
    updateQuestionConfig(sectionId, questionId, {
      options: [...(sections.find((s) => s.id === sectionId)?.questions.find((q) => q.id === questionId)?.config.options || []), `Option ${(sections.find((s) => s.id === sectionId)?.questions.find((q) => q.id === questionId)?.config.options?.length || 0) + 1}`],
    });
  }

  function updateOption(sectionId: string, questionId: string, index: number, value: string) {
    const opts = [...(sections.find((s) => s.id === sectionId)?.questions.find((q) => q.id === questionId)?.config.options || [])];
    opts[index] = value;
    updateQuestionConfig(sectionId, questionId, { options: opts });
  }

  function removeOption(sectionId: string, questionId: string, index: number) {
    const opts = [...(sections.find((s) => s.id === sectionId)?.questions.find((q) => q.id === questionId)?.config.options || [])];
    opts.splice(index, 1);
    updateQuestionConfig(sectionId, questionId, { options: opts });
  }

  // ─── Validation ───
  function validate(): string[] {
    const errs: string[] = [];
    if (!setup.title.trim()) errs.push("Survey title is required");
    if (!setup.slug.trim()) errs.push("Survey slug is required");
    if (sections.length === 0) errs.push("At least one section is required");
    let totalQs = 0;
    sections.forEach((s, si) => {
      if (!s.title.trim()) errs.push(`Section ${si + 1} needs a title`);
      if (s.questions.length === 0) errs.push(`Section "${s.title || si + 1}" has no questions`);
      s.questions.forEach((q, qi) => {
        if (!q.prompt.trim()) errs.push(`Section "${s.title || si + 1}", Question ${qi + 1} needs a prompt`);
        if (q.type === "multiple_choice" && (!q.config.options || q.config.options.length < 2)) {
          errs.push(`Section "${s.title || si + 1}", Question ${qi + 1} needs at least 2 options`);
        }
      });
      totalQs += s.questions.length;
    });
    if (totalQs === 0) errs.push("Survey needs at least one question");
    return errs;
  }

  // ─── Publish ───
  async function publish() {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setPublishing(true);

    try {
      const now = new Date();

      // 1. Create survey
      const surveyRef = doc(collection(db, "surveys"));
      await setDoc(surveyRef, {
        title: setup.title,
        slug: setup.slug,
        description: setup.description,
        toneProfile: setup.toneProfile,
        toneCustom: setup.toneProfile === "custom" ? setup.toneCustom : "",
        languageSelectionEnabled: setup.languageSelectionEnabled,
        responseMode: setup.responseMode,
        intro: setup.intro || null,
        completionMessage: setup.completionMessage || null,
        status: "live",
        createdBy: "admin",
        createdAt: serverTimestamp(),
        updatedBy: "admin",
        updatedAt: serverTimestamp(),
      });

      // 2. Create version
      const versionRef = doc(collection(db, `surveys/${surveyRef.id}/versions`));
      await setDoc(versionRef, {
        versionNumber: 1,
        status: "published",
        publishedAt: serverTimestamp(),
        surveyId: surveyRef.id,
        updatedBy: "admin",
        updatedAt: serverTimestamp(),
      });

      // 3. Create sections + questions
      let qCounter = 0;

      // If named mode, insert name question first
      if (setup.responseMode === "named") {
        qCounter++;
        const nameQRef = doc(collection(db, `surveys/${surveyRef.id}/versions/${versionRef.id}/questions`));
        await setDoc(nameQRef, {
          qKey: "student_name",
          type: "open_text",
          prompt: { en: "What is your name?" },
          sectionId: "__name__",
          section: "name",
          sectionTitle: { en: "Before we start" },
          order: 0,
          required: true,
          config: {},
        });
      }

      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];

        // Create section doc
        const sectionRef = doc(collection(db, `surveys/${surveyRef.id}/versions/${versionRef.id}/sections`));
        await setDoc(sectionRef, {
          title: sec.title,
          order: si,
        });

        // Create questions
        for (let qi = 0; qi < sec.questions.length; qi++) {
          const q = sec.questions[qi];
          qCounter++;
          const qKey = `q_${String(qCounter).padStart(4, "0")}`;

          const questionRef = doc(collection(db, `surveys/${surveyRef.id}/versions/${versionRef.id}/questions`));
          await setDoc(questionRef, {
            qKey,
            type: q.type,
            prompt: { en: q.prompt },
            sectionId: sectionRef.id,
            section: sec.title.toLowerCase().replace(/\s+/g, "_"),
            sectionTitle: { en: sec.title },
            order: qCounter - 1,
            required: q.required,
            config: q.config,
          });
        }
      }

      setPublishedId(surveyRef.id);
    } catch (err) {
      console.error("Publish failed:", err);
      setErrors(["Failed to publish survey. Check console for details."]);
    } finally {
      setPublishing(false);
    }
  }

  // ─── Step navigation ───
  function nextStep() {
    if (step === 1) {
      if (!setup.title.trim()) { setErrors(["Survey title is required"]); return; }
      setErrors([]);
    }
    if (step === 2) {
      const errs = validate();
      if (errs.length > 0) { setErrors(errs); return; }
      setErrors([]);
    }
    setStep((s) => Math.min(s + 1, 4) as Step);
  }

  function prevStep() { setStep((s) => Math.max(s - 1, 1) as Step); }

  // ─── Total question count ───
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  const stepLabels = ["Setup", "Build", "Preview", "Publish"];

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ ...headerStyle(dark), position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/admin" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <div style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: accentBg(dark), borderRadius: 2, color: "#fff", fontSize: 11, fontWeight: 700,
              }}>SV</div>
            </a>
            <span style={{ color: textColor(dark, "tertiary"), fontSize: 13 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: textColor(dark, "primary") }}>
              New Survey
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Step indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {stepLabels.map((label, i) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    background: step > i + 1 ? accentBg(dark) : step === i + 1 ? accentBg(dark) : dark ? "#333" : "#ddd",
                    color: step >= i + 1 ? "#fff" : textColor(dark, "tertiary"),
                  }}>
                    {step > i + 1 ? <Check size={12} /> : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: step === i + 1 ? textColor(dark, "primary") : textColor(dark, "tertiary"), marginRight: 4 }}>
                    {label}
                  </span>
                  {i < 3 && <span style={{ color: textColor(dark, "tertiary"), fontSize: 10 }}>→</span>}
                </div>
              ))}
            </div>
            <button onClick={toggle} style={{
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.6)",
              borderRadius: 2, cursor: "pointer", color: textColor(dark, "secondary"),
            }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ ...glassStyle(dark), padding: 16, marginBottom: 24, borderLeft: "2px solid #c0392b" }}>
            {errors.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: dark ? "#f06060" : "#c0392b", marginBottom: i < errors.length - 1 ? 4 : 0 }}>
                <AlertCircle size={14} /> {e}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* STEP 1: SETUP */}
        {/* ═══════════════════════════════════════ */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Survey Setup</h2>
              <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>Configure the basics before adding questions</p>
            </div>

            <div style={{ ...glassStyle(dark), padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Title */}
              <div>
                <label style={labelStyle(dark)}>Title *</label>
                <input style={inputStyle(dark)} placeholder="e.g. Student Feedback - Week 4" value={setup.title}
                  onChange={(e) => updateSetup("title", e.target.value)} />
              </div>

              {/* Slug */}
              <div>
                <label style={labelStyle(dark)}>Slug</label>
                <input style={inputStyle(dark)} placeholder="auto-generated-from-title" value={setup.slug}
                  onChange={(e) => updateSetup("slug", e.target.value)} />
                <p style={{ fontSize: 11, color: textColor(dark, "tertiary"), marginTop: 4 }}>Used in deployment URLs: /s/{setup.slug || "..."}</p>
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle(dark)}>Description / Purpose</label>
                <textarea style={{ ...inputStyle(dark), minHeight: 80, resize: "vertical" }} placeholder="What is this survey for? (also used by AI for context)"
                  value={setup.description} onChange={(e) => updateSetup("description", e.target.value)} />
              </div>

              {/* Intro message */}
              <div>
                <label style={labelStyle(dark)}>Intro Message (optional)</label>
                <textarea style={{ ...inputStyle(dark), minHeight: 60, resize: "vertical" }} placeholder="Shown to students before they start. Leave blank for default."
                  value={setup.intro} onChange={(e) => updateSetup("intro", e.target.value)} />
              </div>

              {/* Completion message */}
              <div>
                <label style={labelStyle(dark)}>Completion Message (optional)</label>
                <textarea style={{ ...inputStyle(dark), minHeight: 60, resize: "vertical" }} placeholder="Shown when students finish. Leave blank for default."
                  value={setup.completionMessage} onChange={(e) => updateSetup("completionMessage", e.target.value)} />
              </div>
            </div>

            {/* Tone + Language */}
            <div style={{ ...glassStyle(dark), padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Tone Profile */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Sparkles size={14} style={{ color: accentBg(dark) }} />
                  <label style={{ ...labelStyle(dark), margin: 0 }}>Tone Profile</label>
                </div>
                <select style={selectStyle(dark)} value={setup.toneProfile}
                  onChange={(e) => updateSetup("toneProfile", e.target.value)}>
                  {Object.entries(TONE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {setup.toneProfile === "custom" && (
                  <textarea style={{ ...inputStyle(dark), minHeight: 60, resize: "vertical", marginTop: 8 }}
                    placeholder="Custom instructions for how the AI should talk to students..."
                    value={setup.toneCustom} onChange={(e) => updateSetup("toneCustom", e.target.value)} />
                )}
              </div>

              {/* Language toggle */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Globe size={14} style={{ color: accentBg(dark) }} />
                  <label style={{ ...labelStyle(dark), margin: 0 }}>Language Selection</label>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onClick={() => updateSetup("languageSelectionEnabled", !setup.languageSelectionEnabled)}
                >
                  <div style={{
                    width: 40, height: 22, borderRadius: 11, padding: 2,
                    background: setup.languageSelectionEnabled ? accentBg(dark) : (dark ? "#444" : "#ccc"),
                    transition: "background 0.2s", display: "flex", alignItems: "center",
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      transition: "transform 0.2s",
                      transform: setup.languageSelectionEnabled ? "translateX(18px)" : "translateX(0)",
                    }} />
                  </div>
                  <span style={{ fontSize: 13, color: textColor(dark, "secondary") }}>
                    {setup.languageSelectionEnabled ? "Students choose their language" : "English only"}
                  </span>
                </div>
              </div>

              {/* Response Mode */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Users size={14} style={{ color: accentBg(dark) }} />
                  <label style={{ ...labelStyle(dark), margin: 0 }}>Response Mode</label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["anonymous", "named"] as const).map((mode) => (
                    <button key={mode} onClick={() => updateSetup("responseMode", mode)} style={{
                      flex: 1, padding: "10px 14px", borderRadius: 4, cursor: "pointer",
                      border: `1px solid ${setup.responseMode === mode ? accentBg(dark) : (dark ? "#444" : "#ccc")}`,
                      background: setup.responseMode === mode ? `${accentBg(dark)}11` : "transparent",
                      fontFamily: "inherit", textAlign: "left",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: setup.responseMode === mode ? accentBg(dark) : textColor(dark, "primary") }}>
                        {mode === "anonymous" ? "Anonymous" : "Named"}
                      </div>
                      <div style={{ fontSize: 11, color: textColor(dark, "tertiary"), marginTop: 2 }}>
                        {mode === "anonymous" ? "No student names — aggregated data only" : "Students enter their name — view individual responses"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Next */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={btnPrimary(dark)} onClick={nextStep}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHoverBg(dark)}
                onMouseLeave={(e) => e.currentTarget.style.background = accentBg(dark)}>
                Next: Add Sections <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* STEP 2: BUILD SECTIONS */}
        {/* ═══════════════════════════════════════ */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Build Sections</h2>
                <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>{sections.length} section{sections.length !== 1 ? "s" : ""} · {totalQuestions} question{totalQuestions !== 1 ? "s" : ""}</p>
              </div>
              <button style={btnSmall(dark)} onClick={addSection}>
                <Plus size={12} /> Add Section
              </button>
            </div>

            {sections.map((sec, si) => (
              <div key={sec.id} style={{ ...glassStyle(dark), overflow: "hidden" }}>
                {/* Section header */}
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: sec.collapsed ? "none" : `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                  <button onClick={() => updateSection(sec.id, "collapsed", !sec.collapsed)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), display: "flex", padding: 0 }}>
                    {sec.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                  <span style={microLabel(dark)}>Section {si + 1}</span>
                  <input
                    style={{ ...inputStyle(dark), flex: 1, padding: "4px 8px", fontSize: 14, fontWeight: 600 }}
                    placeholder="Section name (e.g. Learning Environment)"
                    value={sec.title}
                    onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                  />
                  <span style={{ fontSize: 11, color: textColor(dark, "tertiary") }}>{sec.questions.length} Q</span>
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(sec.id)} style={{ background: "none", border: "none", cursor: "pointer", color: dark ? "#f06060" : "#c0392b", display: "flex", padding: 2 }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Questions */}
                {!sec.collapsed && (
                  <div style={{ padding: "8px 16px 16px" }}>
                    {sec.questions.map((q, qi) => (
                      <div key={q.id} style={{
                        padding: 12, marginBottom: 8, borderRadius: 2,
                        background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                        border: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      }}>
                        {/* Question header row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: accentBg(dark) }}>Q{qi + 1}</span>
                          <select style={{ ...selectStyle(dark), flex: "0 0 auto", width: "auto", padding: "2px 8px", fontSize: 12 }}
                            value={q.type} onChange={(e) => updateQuestion(sec.id, q.id, { type: e.target.value as QuestionType, config: defaultConfig(e.target.value as QuestionType) })}>
                            {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <div style={{ flex: 1 }} />
                          {/* Required toggle */}
                          <button onClick={() => updateQuestion(sec.id, q.id, { required: !q.required })}
                            style={{ ...btnSmall(dark), fontSize: 10, color: q.required ? accentBg(dark) : textColor(dark, "tertiary") }}>
                            {q.required ? "Required" : "Optional"}
                          </button>
                          {/* Move up/down */}
                          <button onClick={() => moveQuestion(sec.id, q.id, "up")} style={{ background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), padding: 2, opacity: qi === 0 ? 0.3 : 1 }}>
                            <ChevronUp size={14} />
                          </button>
                          <button onClick={() => moveQuestion(sec.id, q.id, "down")} style={{ background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), padding: 2, opacity: qi === sec.questions.length - 1 ? 0.3 : 1 }}>
                            <ChevronDown size={14} />
                          </button>
                          {/* Duplicate */}
                          <button onClick={() => duplicateQuestion(sec.id, q.id)} style={{ background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), padding: 2 }}>
                            <Copy size={13} />
                          </button>
                          {/* Delete */}
                          <button onClick={() => removeQuestion(sec.id, q.id)} style={{ background: "none", border: "none", cursor: "pointer", color: dark ? "#f06060" : "#c0392b", padding: 2 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Prompt */}
                        <input style={{ ...inputStyle(dark), marginBottom: 8 }} placeholder="Question prompt (in English)"
                          value={q.prompt} onChange={(e) => updateQuestion(sec.id, q.id, { prompt: e.target.value })} />

                        {/* Type-specific config */}
                        {(q.type === "scale" || q.type === "nps") && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>Min</label>
                              <input style={inputStyle(dark)} type="number" value={q.config.min ?? 0}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { min: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>Max</label>
                              <input style={inputStyle(dark)} type="number" value={q.config.max ?? 3}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { max: parseInt(e.target.value) || 3 })} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>Low label</label>
                              <input style={inputStyle(dark)} value={q.config.lowLabel ?? ""}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { lowLabel: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>High label</label>
                              <input style={inputStyle(dark)} value={q.config.highLabel ?? ""}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { highLabel: e.target.value })} />
                            </div>
                          </div>
                        )}

                        {q.type === "slider" && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>Low label</label>
                              <input style={inputStyle(dark)} value={q.config.lowLabel ?? ""}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { lowLabel: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ ...labelStyle(dark), fontSize: 10 }}>High label</label>
                              <input style={inputStyle(dark)} value={q.config.highLabel ?? ""}
                                onChange={(e) => updateQuestionConfig(sec.id, q.id, { highLabel: e.target.value })} />
                            </div>
                          </div>
                        )}

                        {q.type === "multiple_choice" && (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <label style={{ ...labelStyle(dark), fontSize: 10, margin: 0 }}>Options</label>
                              <button onClick={() => updateQuestionConfig(sec.id, q.id, { selectMode: q.config.selectMode === "single" ? "multi" : "single" })}
                                style={{ ...btnSmall(dark), fontSize: 10 }}>
                                {q.config.selectMode === "single" ? "Single select" : "Multi select"}
                              </button>
                            </div>
                            {(q.config.options || []).map((opt, oi) => (
                              <div key={oi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: textColor(dark, "tertiary"), width: 16 }}>{oi + 1}</span>
                                <input style={{ ...inputStyle(dark), flex: 1, padding: "4px 8px", fontSize: 13 }} value={opt}
                                  onChange={(e) => updateOption(sec.id, q.id, oi, e.target.value)} />
                                {(q.config.options?.length || 0) > 2 && (
                                  <button onClick={() => removeOption(sec.id, q.id, oi)} style={{ background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), padding: 2 }}>
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={() => addOption(sec.id, q.id)} style={{ ...btnSmall(dark), marginTop: 4 }}>
                              <Plus size={10} /> Add option
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add question */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([type, label]) => (
                        <button key={type} onClick={() => addQuestion(sec.id, type as QuestionType)}
                          style={{ ...btnSmall(dark) }}>
                          <Plus size={10} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Nav */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button style={btnSecondary(dark)} onClick={prevStep}>
                <ArrowLeft size={14} /> Back
              </button>
              <button style={btnPrimary(dark)} onClick={nextStep}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHoverBg(dark)}
                onMouseLeave={(e) => e.currentTarget.style.background = accentBg(dark)}>
                Next: Preview <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* STEP 3: PREVIEW */}
        {/* ═══════════════════════════════════════ */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Preview</h2>
              <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>This is what students will see</p>
            </div>

            {/* Simulated survey */}
            <div style={{ ...glassStyle(dark), padding: 24, maxWidth: 400, margin: "0 auto", width: "100%" }}>
              {/* Language */}
              {setup.languageSelectionEnabled && (
                <div style={{ textAlign: "center", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                  <div style={{ fontSize: 11, color: textColor(dark, "tertiary"), marginBottom: 4 }}>🌍 Language selection enabled</div>
                  <div style={{ fontSize: 13, color: textColor(dark, "secondary") }}>Students choose from 10 languages</div>
                </div>
              )}

              {/* Intro */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: textColor(dark, "primary"), marginBottom: 4 }}>{setup.title || "Survey Title"}</div>
                <div style={{ fontSize: 13, color: textColor(dark, "secondary") }}>
                  {setup.intro || (setup.responseMode === "named" ? "We'd love to hear your thoughts. Your teacher will review your responses." : "We'd love to hear your feedback. Your answers are anonymous.")}
                </div>
              </div>

              {/* Questions preview */}
              {sections.map((sec) => (
                <div key={sec.id} style={{ marginBottom: 16 }}>
                  <div style={{ ...microLabel(dark), marginBottom: 8, borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`, paddingBottom: 6 }}>
                    {sec.title || "Untitled Section"}
                  </div>
                  {sec.questions.map((q, qi) => (
                    <div key={q.id} style={{ marginBottom: 12, padding: 8, borderRadius: 2, background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: textColor(dark, "primary"), marginBottom: 6 }}>
                        {q.prompt || `Question ${qi + 1}`}
                        {q.required && <span style={{ color: dark ? "#f06060" : "#c0392b", marginLeft: 2 }}>*</span>}
                      </div>

                      {/* Scale preview */}
                      {q.type === "scale" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {Array.from({ length: (q.config.max ?? 3) - (q.config.min ?? 0) + 1 }, (_, i) => (
                            <div key={i} style={{
                              flex: 1, padding: "6px 0", textAlign: "center", fontSize: 12, borderRadius: 2,
                              background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                              color: textColor(dark, "secondary"),
                            }}>
                              {(q.config.min ?? 0) + i}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Slider preview */}
                      {q.type === "slider" && (
                        <div>
                          <div style={{ height: 6, background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", borderRadius: 3, position: "relative" }}>
                            <div style={{ position: "absolute", left: "50%", top: -4, width: 14, height: 14, borderRadius: "50%", background: accentBg(dark), transform: "translateX(-50%)" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: textColor(dark, "tertiary"), marginTop: 4 }}>
                            <span>{q.config.lowLabel}</span><span>{q.config.highLabel}</span>
                          </div>
                        </div>
                      )}

                      {/* MC preview */}
                      {q.type === "multiple_choice" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(q.config.options || []).map((opt, oi) => (
                            <div key={oi} style={{
                              padding: "6px 10px", fontSize: 12, borderRadius: 2,
                              background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                              color: textColor(dark, "secondary"),
                            }}>
                              {q.config.selectMode === "multi" ? "☐" : "○"} {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Open text preview */}
                      {q.type === "open_text" && (
                        <div style={{
                          padding: 8, fontSize: 12, borderRadius: 2, minHeight: 40,
                          background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                          color: textColor(dark, "tertiary"), fontStyle: "italic",
                        }}>
                          Student types here...
                        </div>
                      )}

                      {/* NPS preview */}
                      {q.type === "nps" && (
                        <div>
                          <div style={{ display: "flex", gap: 2 }}>
                            {Array.from({ length: 11 }, (_, i) => (
                              <div key={i} style={{
                                flex: 1, padding: "6px 0", textAlign: "center", fontSize: 10, borderRadius: 2,
                                background: i <= 6 ? (dark ? "rgba(240,96,96,0.15)" : "rgba(192,57,43,0.1)") : i <= 8 ? (dark ? "rgba(240,160,80,0.15)" : "rgba(199,83,0,0.1)") : (dark ? "rgba(93,190,104,0.15)" : "rgba(30,122,46,0.1)"),
                                color: textColor(dark, "secondary"),
                              }}>
                                {i}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: textColor(dark, "tertiary"), marginTop: 4 }}>
                            <span>{q.config.lowLabel}</span><span>{q.config.highLabel}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Completion */}
              <div style={{ textAlign: "center", paddingTop: 16, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 13, color: textColor(dark, "secondary") }}>
                  {setup.completionMessage || "Thank you! Your feedback has been submitted."}
                </div>
              </div>
            </div>

            {/* Nav */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button style={btnSecondary(dark)} onClick={prevStep}>
                <ArrowLeft size={14} /> Back to Edit
              </button>
              <button style={btnPrimary(dark)} onClick={nextStep}
                onMouseEnter={(e) => e.currentTarget.style.background = accentHoverBg(dark)}
                onMouseLeave={(e) => e.currentTarget.style.background = accentBg(dark)}>
                Publish Survey <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* STEP 4: PUBLISH */}
        {/* ═══════════════════════════════════════ */}
        {step === 4 && !publishedId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Publish Survey</h2>
              <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>Review and confirm</p>
            </div>

            <div style={{ ...glassStyle(dark), padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={microLabel(dark)}>Title</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: textColor(dark, "primary"), marginTop: 4 }}>{setup.title}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Slug</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4, fontFamily: "monospace" }}>{setup.slug}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Sections</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4 }}>{sections.length}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Questions</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4 }}>{totalQuestions}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Tone Profile</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4 }}>{TONE_LABELS[setup.toneProfile]}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Language Selection</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4 }}>{setup.languageSelectionEnabled ? "Enabled" : "English only"}</div>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                <div style={microLabel(dark)}>Sections Breakdown</div>
                {sections.map((sec, si) => (
                  <div key={sec.id} style={{ fontSize: 13, color: textColor(dark, "secondary"), marginTop: 6 }}>
                    <strong>{sec.title || `Section ${si + 1}`}</strong> — {sec.questions.length} question{sec.questions.length !== 1 ? "s" : ""}
                    <span style={{ color: textColor(dark, "tertiary"), marginLeft: 8 }}>
                      ({sec.questions.map((q) => QUESTION_TYPE_LABELS[q.type]).join(", ")})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nav */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button style={btnSecondary(dark)} onClick={prevStep}>
                <ArrowLeft size={14} /> Back
              </button>
              <button style={{ ...btnPrimary(dark), opacity: publishing ? 0.6 : 1 }}
                onClick={publish} disabled={publishing}
                onMouseEnter={(e) => !publishing && (e.currentTarget.style.background = accentHoverBg(dark))}
                onMouseLeave={(e) => !publishing && (e.currentTarget.style.background = accentBg(dark))}>
                {publishing ? "Publishing..." : "Confirm & Publish"} <Check size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* PUBLISHED SUCCESS */}
        {/* ═══════════════════════════════════════ */}
        {step === 4 && publishedId && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "48px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: accentBg(dark), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={28} color="#fff" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Survey Published!</h2>
            <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), textAlign: "center" }}>
              Your survey is live. Create a deployment to start collecting responses.
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <a href={`/admin/surveys/${publishedId}/deployments/new`}
                style={{ ...btnPrimary(dark), textDecoration: "none" }}>
                Create Deployment <ArrowRight size={14} />
              </a>
              <a href={`/admin/surveys/${publishedId}`}
                style={{ ...btnSecondary(dark), textDecoration: "none" }}>
                Go to Dashboard
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}