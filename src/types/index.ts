// ===========================================
// Firestore Data Model Types — V3
// ===========================================

// --- SURVEYS ---
export interface Survey {
  id?: string;
  title: string;
  slug: string;
  description?: string;
  toneProfile: "friendly" | "professional" | "simple" | "custom";
  toneCustom?: string;
  languageSelectionEnabled: boolean;
  intro?: string;
  completionMessage?: string;
  status: "draft" | "live" | "archived";
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
}

// --- VERSIONS ---
export interface SurveyVersion {
  id?: string;
  versionNumber: number;
  status: "draft" | "published";
  publishedAt: Date | null;
  surveyId: string;
  updatedBy?: string;
  updatedAt?: Date;
}

// --- SECTIONS ---
// Path: surveys/{surveyId}/versions/{versionId}/sections/{sectionId}
export interface Section {
  id?: string;
  title: string;
  order: number;
}

// --- QUESTIONS ---
// Path: surveys/{surveyId}/versions/{versionId}/questions/{questionId}
export type QuestionType = "scale" | "slider" | "nps" | "multiple_choice" | "open_text";

export interface QuestionConfig {
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  options?: string[];
  selectMode?: "single" | "multi";
}

// Translated text - key is language code
export type TranslatedText = Record<string, string>;

export interface Question {
  id?: string;
  qKey: string;
  type: QuestionType;
  prompt: TranslatedText;
  sectionId: string;
  order: number;
  required: boolean;
  config: QuestionConfig;
  // Legacy compat
  section?: string;
  sectionTitle?: TranslatedText;
}

// --- DEPLOYMENTS ---
export interface Deployment {
  id?: string;
  surveyId: string;
  versionId: string;
  token: string;
  label: string;
  campus?: string;
  status: "live" | "paused";
  deliveryMode: "form" | "chatbot";
  createdAt: Date;
}

// --- SESSIONS ---
export interface Session {
  id?: string;
  surveyId: string;
  surveyVersionId: string;
  deploymentId: string;
  language: string;
  startedAt: Date;
  completedAt: Date | null;
}

// --- RESPONSES ---
// Path: sessions/{sessionId}/responses/{responseId}
export interface Response {
  id?: string;
  questionId: string;
  qKey: string;
  type: QuestionType;
  response: Record<string, any>;
  responseText: string | null;
  score: number | null;
  createdAt: Date;
}