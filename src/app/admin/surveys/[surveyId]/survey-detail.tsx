"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Users, BarChart3, Clock, MessageSquare, Link2, ChevronDown, ChevronUp, Plus, ClipboardList, ExternalLink, Sparkles, ArrowUp, ArrowDown, Minus, GitCompareArrows, Download, FileText, Share2, Mail, Edit3 } from "lucide-react";

interface SurveyData { title: string; status: string; createdAt: Date; }
interface QuestionData { id: string; qKey: string; type: string; prompt: Record<string,string>; section?: string; sectionId?: string; sectionTitle?: Record<string,string>; order: number; required?: boolean; config?: { min?: number; max?: number; lowLabel?: string; highLabel?: string; options?: string[]; selectMode?: string; }; }
interface DeploymentData { id: string; token: string; label: string; campus?: string; status: string; deliveryMode?: string; createdAt: Date; }
interface SessionData { id: string; deploymentId: string; language: string; completedAt: Date | null; startedAt: Date; }
interface ResponseData { questionId: string; qKey: string; type: string; score: number | null; responseText: string | null; responseOriginal?: string | null; responseLanguage?: string | null; response: Record<string,any>; }
interface QuestionScore { qKey: string; prompt: string; type: string; avgScore: number; maxScore: number; count: number; optionCounts?: { option: string; count: number }[]; }
interface CommentEntry { text: string; original?: string; lang?: string; }
interface SectionScore { section: string; sectionTitle: string; avgScore: number; maxScore: number; questionScores: QuestionScore[]; comments: CommentEntry[]; }

function glassStyle(dark: boolean): React.CSSProperties { return { background: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.4)", borderRadius: "2px", boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s ease" }; }
function headerStyle(dark: boolean): React.CSSProperties { return { background: dark ? "rgba(30,30,30,0.85)" : "#ffffff", borderBottom: dark ? "1px solid #333" : "1px solid #d4d4d4", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }; }
function accentBg(dark: boolean) { return dark ? "#4da6ff" : "#0078d4"; }
function accentHoverBg(dark: boolean) { return dark ? "#3d96ef" : "#106ebe"; }
function textColor(dark: boolean, level: "primary"|"secondary"|"tertiary") { return ({ primary: dark ? "#eaeaea" : "#1a1a1a", secondary: dark ? "#a0a0a0" : "#555555", tertiary: dark ? "#606060" : "#8a8a8a" })[level]; }
function badgeStyle(status: string, dark: boolean): React.CSSProperties { const s: Record<string,React.CSSProperties> = { live: { background: dark?"#162e1a":"#dff5e3", color: dark?"#5dbe68":"#1e7a2e", border: dark?"1px solid #2a4d2e":"1px solid #b8e6c0" }, draft: { background: dark?"#332414":"#fff3e0", color: dark?"#f0a050":"#c75300", border: dark?"1px solid #4d3820":"1px solid #ffd699" }, paused: { background: dark?"#332414":"#fff3e0", color: dark?"#f0a050":"#c75300", border: dark?"1px solid #4d3820":"1px solid #ffd699" }, archived: { background: dark?"#222":"#f0f0f0", color: dark?"#606060":"#8a8a8a", border: dark?"1px solid #333":"1px solid #d4d4d4" } }; return { ...s[status]||s.archived, borderRadius:2, fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.04em", padding:"2px 8px" }; }
function scoreColor(score: number, max: number, dark: boolean): string { const pct = max>0?score/max:0; if(pct>=0.75) return dark?"#5dbe68":"#1e7a2e"; if(pct>=0.5) return dark?"#f0a050":"#c75300"; return dark?"#f06060":"#c0392b"; }

// ─── Shared summary renderer ───
function renderMarkdownInline(text: string): React.ReactNode {
  // Convert **bold** to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderSummaryBlock(text: string, dark: boolean, accentBgFn: (d: boolean) => string) {
  return text.split("\n").map((line, i) => {
    // Heading
    if (line.startsWith("## ")) {
      const ht = line.replace("## ", "");
      let bc = accentBgFn(dark);
      if (ht.includes("🟢") || ht.includes("🏆")) bc = dark ? "#5dbe68" : "#1e7a2e";
      else if (ht.includes("🟠") || ht.includes("⚠️")) bc = dark ? "#f0a050" : "#c75300";
      else if (ht.includes("🔴")) bc = dark ? "#f06060" : "#c0392b";
      return <div key={i} style={{ fontSize: 15, fontWeight: 700, color: dark ? "#eaeaea" : "#1a1a1a", margin: i > 0 ? "24px 0 8px" : "0 0 8px", paddingBottom: 6, borderBottom: `2px solid ${bc}` }}>{renderMarkdownInline(ht)}</div>;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, "");
      return <div key={i} style={{ padding: "5px 0 5px 20px", position: "relative" }}><span style={{ position: "absolute", left: 0, color: dark ? "#606060" : "#8a8a8a", fontWeight: 600, fontSize: 12 }}>{line.match(/^\d+/)![0]}.</span>{renderMarkdownInline(content)}</div>;
    }
    // Bullet
    if (line.startsWith("- ")) return <div key={i} style={{ padding: "5px 0 5px 20px", position: "relative" }}><span style={{ position: "absolute", left: 4, color: dark ? "#606060" : "#8a8a8a" }}>•</span>{renderMarkdownInline(line.slice(2))}</div>;
    // Warning line
    if (line.startsWith("⚠️")) return <div key={i} style={{ padding: "10px 14px", background: dark ? "rgba(240,160,80,0.1)" : "rgba(199,83,0,0.08)", borderRadius: 2, borderLeft: dark ? "2px solid #f0a050" : "2px solid #c75300", margin: "4px 0", fontSize: 13, color: dark ? "#f0a050" : "#c75300" }}>{renderMarkdownInline(line)}</div>;
    // Empty
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    // Normal
    return <div key={i} style={{ padding: "2px 0" }}>{renderMarkdownInline(line)}</div>;
  });
}
function formatTime(seconds: number): string { if(seconds===0) return "—"; if(seconds<60) return `${seconds}s`; const m=Math.floor(seconds/60); const s=seconds%60; return s>0?`${m}m ${s}s`:`${m}m`; }

type Tab = "overview"|"sections"|"comments"|"compare"|"ai";

export function SurveyDetail({ surveyId }: { surveyId: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [survey, setSurvey] = useState<SurveyData|null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [deployments, setDeployments] = useState<DeploymentData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [allResponses, setAllResponses] = useState<Map<string,ResponseData[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [filterDeployment, setFilterDeployment] = useState<string>("all");
  // AI Summary state
  const [aiSummary, setAiSummary] = useState<string|null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string|null>(null);
  // Q&A chat state
  const [qaMessages, setQaMessages] = useState<{role:"user"|"assistant";content:string}[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);
  const qaInputRef = useRef<HTMLInputElement>(null);
  // Compare state
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [compareSummary, setCompareSummary] = useState<string|null>(null);
  const [compareAiLoading, setCompareAiLoading] = useState(false);
  const [compareMode, setCompareMode] = useState<"1v1"|"all">("all");
  const [multiCompareSummary, setMultiCompareSummary] = useState<string|null>(null);
  const [multiCompareAiLoading, setMultiCompareAiLoading] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [reportContent, setReportContent] = useState<string>("");
  const [reportEditMode, setReportEditMode] = useState(false);

  useEffect(() => { loadAll(); }, [surveyId]);

  async function loadAll() {
    try {
      const surveyDoc = await getDoc(doc(db,"surveys",surveyId));
      if(!surveyDoc.exists()) return;
      const sData = surveyDoc.data();
      setSurvey({ title:sData.title, status:sData.status, createdAt:sData.createdAt?.toDate()||new Date() });
      const versionsSnap = await getDocs(query(collection(db,`surveys/${surveyId}/versions`),where("status","==","published")));
      if(versionsSnap.empty){setLoading(false);return;}
      const versionId = versionsSnap.docs[0].id;
      const qSnap = await getDocs(query(collection(db,`surveys/${surveyId}/versions/${versionId}/questions`),orderBy("order")));
      const qs = qSnap.docs.map((d)=>({id:d.id,...d.data()} as QuestionData));
      setQuestions(qs);
      const depSnap = await getDocs(query(collection(db,"deployments"),where("surveyId","==",surveyId)));
      setDeployments(depSnap.docs.map((d)=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate()||new Date()} as DeploymentData)));
      const sessSnap = await getDocs(query(collection(db,"sessions"),where("surveyId","==",surveyId)));
      const sessList = sessSnap.docs.map((d)=>({id:d.id,...d.data(),completedAt:d.data().completedAt?.toDate()||null,startedAt:d.data().startedAt?.toDate()||new Date()} as SessionData));
      setSessions(sessList);
      const respMap = new Map<string,ResponseData[]>();
      for(const sess of sessList){ const rSnap = await getDocs(collection(db,`sessions/${sess.id}/responses`)); respMap.set(sess.id,rSnap.docs.map((d)=>d.data() as ResponseData)); }
      setAllResponses(respMap);
    } catch(err){ console.error("Failed to load survey:",err); } finally { setLoading(false); }
  }

  function computeSectionsFromResponses(flatResponses: ResponseData[]): SectionScore[] {
    const sectionMap: Map<string,SectionScore> = new Map();
    for(const q of questions){
      const section = q.sectionId||q.section||"other";
      const sectionTitle = q.sectionTitle?.en||q.section||"Questions";
      const maxScore = q.config?.max??3;
      if(!sectionMap.has(section)) sectionMap.set(section,{section,sectionTitle,avgScore:0,maxScore,questionScores:[],comments:[]});
      const sec = sectionMap.get(section)!;
      const qResps = flatResponses.filter((r)=>r.qKey===q.qKey);
      if(q.type==="text"||q.type==="open_text"){
        const comments: CommentEntry[] = qResps.map((r)=>{
          const text = r.responseText||r.response?.text;
          if(!text) return null;
          return { text, original: r.responseOriginal||r.response?.textEnglish?r.response?.text:undefined, lang: r.responseLanguage||undefined };
        }).filter(Boolean) as CommentEntry[];
        sec.comments.push(...comments);
        sec.questionScores.push({qKey:q.qKey,prompt:q.prompt?.en||q.qKey,type:q.type,avgScore:0,maxScore:0,count:comments.length});
      } else if(q.type==="multiple_choice"){
        const options = q.config?.options||[];
        const optionCounts = options.map((opt)=>({ option:opt, count:qResps.filter((r)=>r.response?.value===opt||(Array.isArray(r.response?.value)&&r.response.value.includes(opt))||(r.response?.index!==undefined&&options[r.response.index]===opt)||(Array.isArray(r.response?.indices)&&r.response.indices.some((idx:number)=>options[idx]===opt))).length }));
        sec.questionScores.push({qKey:q.qKey,prompt:q.prompt?.en||q.qKey,type:q.type,avgScore:0,maxScore:0,count:qResps.length,optionCounts});
      } else {
        const scores = qResps.map((r)=>r.score).filter((s):s is number=>s!==null);
        const avg = scores.length>0?scores.reduce((a,b)=>a+b,0)/scores.length:0;
        sec.questionScores.push({qKey:q.qKey,prompt:q.prompt?.en||q.qKey,type:q.type,avgScore:Math.round(avg*100)/100,maxScore,count:scores.length});
      }
    }
    for(const sec of sectionMap.values()){
      const scored = sec.questionScores.filter((q)=>q.type!=="multiple_choice"&&q.maxScore>0);
      if(scored.length>0){
        const maxForSection = scored[0]?.maxScore||3;
        const pctAvg = scored.reduce((a,b)=>a+(b.maxScore>0?b.avgScore/b.maxScore:0),0)/scored.length;
        sec.avgScore = Math.round(pctAvg*maxForSection*100)/100;
        sec.maxScore = maxForSection;
      } else {
        sec.avgScore = 0;
        sec.maxScore = 0;
      }
    }
    return Array.from(sectionMap.values());
  }

  function toggleSection(section: string){ setExpandedSections((prev)=>{ const next=new Set(prev); next.has(section)?next.delete(section):next.add(section); return next; }); }

  // Apply deployment filter
  const filteredSessions = filterDeployment === "all" ? sessions : sessions.filter((s) => s.deploymentId === filterDeployment);
  const filteredSessionIds = new Set(filteredSessions.map((s) => s.id));
  const filteredResponses = new Map<string, ResponseData[]>();
  allResponses.forEach((resps, sessId) => { if (filteredSessionIds.has(sessId)) filteredResponses.set(sessId, resps); });

  function computeFilteredSections(): SectionScore[] {
    const flatResponses: ResponseData[] = [];
    filteredResponses.forEach((resps) => flatResponses.push(...resps));
    return computeSectionsFromResponses(flatResponses);
  }

  const completed = filteredSessions.filter((s)=>s.completedAt!==null);
  const sectionScores = computeFilteredSections();
  const scoredSections = sectionScores.filter((s)=>s.questionScores.some((q)=>q.type!=="multiple_choice"&&q.maxScore>0));
  const overallAvg = scoredSections.length>0?Math.round((scoredSections.reduce((a,b)=>a+(b.maxScore>0?b.avgScore/b.maxScore:0),0)/scoredSections.length)*100):0;
  const allComments = sectionScores.flatMap((s)=>s.comments);
  const completionTimes = completed.map((s)=>{const start=s.startedAt?.getTime?.()||0;const end=s.completedAt?.getTime?.()||0;return end-start;}).filter((t)=>t>0);
  const avgTimeSeconds = completionTimes.length>0?Math.round(completionTimes.reduce((a,b)=>a+b,0)/completionTimes.length/1000):0;

  if(loading) return <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:textColor(dark,"tertiary"),fontSize:14}}>Loading survey...</p></div>;
  if(!survey) return <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:textColor(dark,"tertiary"),fontSize:14}}>Survey not found</p></div>;

  const tabs: {key:Tab;label:string;icon:React.ReactNode}[] = [{key:"overview",label:"Overview",icon:<BarChart3 size={14}/>},{key:"sections",label:"Sections",icon:<Users size={14}/>},{key:"comments",label:"Comments",icon:<MessageSquare size={14}/>},{key:"compare",label:"Compare",icon:<GitCompareArrows size={14}/>},{key:"ai",label:"AI Summary",icon:<Sparkles size={14}/>}];

  // ─── Build data snapshot (shared by summary + Q&A) ───
  function buildDataSnapshot(): string {
    const totalResponses = sessions.length;
    const completedCount = completed.length;
    const allResps: ResponseData[] = []; filteredResponses.forEach((r) => allResps.push(...r)); const secs = computeSectionsFromResponses(allResps);

    let dataText = `SURVEY: "${survey?.title}"\n`;
    dataText += `TOTAL SESSIONS: ${totalResponses}\n`;
    dataText += `COMPLETED: ${completedCount}\n`;
    dataText += `OVERALL SCORE: ${overallAvg}%\n\n`;

    for (const sec of secs) {
      dataText += `SECTION: ${sec.sectionTitle}\n`;
      if (sec.maxScore > 0) dataText += `  Section Average: ${sec.avgScore}/${sec.maxScore} (${Math.round((sec.avgScore/sec.maxScore)*100)}%)\n`;
      for (const qs of sec.questionScores) {
        if (qs.type === "multiple_choice" && qs.optionCounts) {
          dataText += `  Q: "${qs.prompt}" — ${qs.count} responses\n`;
          for (const oc of qs.optionCounts) dataText += `    - ${oc.option}: ${oc.count}\n`;
        } else if (qs.maxScore > 0) {
          const pct = Math.round((qs.avgScore / qs.maxScore) * 100);
          dataText += `  Q: "${qs.prompt}" — avg ${qs.avgScore}/${qs.maxScore} (${pct}%) — ${qs.count} responses\n`;
        }
      }
      if (sec.comments.length > 0) {
        dataText += `  COMMENTS:\n`;
        for (const c of sec.comments) dataText += `    - "${c.text}"${c.original ? ` (original: "${c.original}")` : ""}\n`;
      }
      dataText += `\n`;
    }
    return dataText;
  }

  // ─── AI Summary ───
  async function generateAISummary() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);

    const dataText = buildDataSnapshot();

    const systemPrompt = `You analyze student feedback survey data. You MUST follow these rules:

RULE 1 - ONLY USE DATA PROVIDED:
- Never invent, guess, or assume anything not in the data
- If data is limited, say so clearly
- Quote exact numbers from the data

RULE 2 - RESPONSE COUNT CHECK:
- If fewer than 5 responses: start with "⚠️ Low response count (X responses). These results may not be representative."
- If 5-15 responses: note "Based on X responses — a small sample."
- If 15+: just state the count

RULE 3 - STRUCTURE (use these exact headings):
## Overview
1-2 sentences. State response count, overall score, and one key takeaway.

## Highlights
- Highest scoring areas (with exact scores)
- Lowest scoring areas (with exact scores)
- Any recurring themes in comments (quote them)

## 🟢 Green Flags
Things going well. Use exact scores/quotes.

## 🟠 Orange Flags  
Areas to watch. Scores between 40-65% or mixed feedback.

## 🔴 Red Flags
Concerns. Scores below 40% or negative comments.

RULE 4 - KEEP IT SHORT:
- Max 3 bullet points per section
- Each bullet max 1-2 sentences
- No filler language, no "overall", no "in general"
- If a section has nothing to report, write "None identified from current data."`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: "user", content: `Here is the survey data. Analyze it:\n\n${dataText}` }],
          max_tokens: 1024,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiSummary(data.text);
    } catch (err: any) {
      console.error("AI summary error:", err);
      setAiError(err.message || "Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  }

  // ─── Compare Deployments ───
  function computeDeploymentScores(deploymentId: string): { qKey: string; prompt: string; type: string; avg: number; max: number; count: number }[] {
    const depSessions = sessions.filter((s) => s.deploymentId === deploymentId);
    const depResponses: ResponseData[] = [];
    for (const sess of depSessions) {
      const resps = allResponses.get(sess.id);
      if (resps) depResponses.push(...resps);
    }

    return questions.filter((q) => q.type !== "open_text" && q.type !== "text" && q.type !== "multiple_choice").map((q) => {
      const scores = depResponses.filter((r) => r.qKey === q.qKey).map((r) => r.score).filter((s): s is number => s !== null);
      const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
      return { qKey: q.qKey, prompt: q.prompt?.en || q.qKey, type: q.type, avg, max: q.config?.max ?? 3, count: scores.length };
    });
  }

  function buildCompareDataText(): string {
    if (!compareA || !compareB) return "";
    const depA = deployments.find((d) => d.id === compareA);
    const depB = deployments.find((d) => d.id === compareB);
    if (!depA || !depB) return "";

    const scoresA = computeDeploymentScores(compareA);
    const scoresB = computeDeploymentScores(compareB);
    const sessA = sessions.filter((s) => s.deploymentId === compareA);
    const sessB = sessions.filter((s) => s.deploymentId === compareB);

    let text = `COMPARISON: "${depA.label}" (${sessA.length} responses) vs "${depB.label}" (${sessB.length} responses)\n\n`;

    for (let i = 0; i < scoresA.length; i++) {
      const a = scoresA[i];
      const b = scoresB.find((s) => s.qKey === a.qKey);
      if (!b) continue;
      const diff = Math.round((a.avg - b.avg) * 100) / 100;
      const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "=";
      text += `Q: "${a.prompt}" — ${depA.label}: ${a.avg}/${a.max} (${a.count} resp) | ${depB.label}: ${b.avg}/${b.max} (${b.count} resp) | diff: ${arrow} ${Math.abs(diff)}\n`;
    }

    // Comments comparison
    const commentsA: string[] = [];
    const commentsB: string[] = [];
    for (const sess of sessA) { const resps = allResponses.get(sess.id) || []; commentsA.push(...resps.filter((r) => r.responseText).map((r) => r.responseText!)); }
    for (const sess of sessB) { const resps = allResponses.get(sess.id) || []; commentsB.push(...resps.filter((r) => r.responseText).map((r) => r.responseText!)); }
    if (commentsA.length > 0) { text += `\n${depA.label} COMMENTS:\n`; for (const c of commentsA) text += `  - "${c}"\n`; }
    if (commentsB.length > 0) { text += `\n${depB.label} COMMENTS:\n`; for (const c of commentsB) text += `  - "${c}"\n`; }

    return text;
  }

  async function generateCompareSummary() {
    if (compareAiLoading || !compareA || !compareB) return;
    setCompareAiLoading(true);
    setCompareSummary(null);

    const dataText = buildCompareDataText();

    const systemPrompt = `You compare two deployments of the same student feedback survey.

RULES:
1. ONLY use the data provided. Never guess.
2. Quote exact numbers.
3. Keep it short — max 2-3 sentences per point.

STRUCTURE:
## Key Differences
- List the biggest score differences (with exact numbers and arrows ↑↓)
- Note which deployment scored higher overall

## 🟢 Deployment A Strengths
Where deployment A scored notably higher.

## 🟢 Deployment B Strengths
Where deployment B scored notably higher.

## 🔴 Shared Concerns
Low scores in both deployments.

## Comment Themes
Any notable differences in open text feedback.

If differences are small (<0.3 on a 0-3 scale), say "No significant difference."
If response counts are low (<5), note this clearly.`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: [{ role: "user", content: `Compare these deployments:\n\n${dataText}` }], max_tokens: 1024 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCompareSummary(data.text);
    } catch (err) {
      setCompareSummary("Failed to generate comparison summary. Check your API key.");
    } finally {
      setCompareAiLoading(false);
    }
  }

  // ─── Multi-Compare (All Deployments) ───
  function buildMultiCompareData(): string {
    let text = `MULTI-DEPLOYMENT COMPARISON for "${survey?.title}"\n\n`;
    for (const dep of deployments) {
      const depSessions = sessions.filter((s) => s.deploymentId === dep.id);
      const scores = computeDeploymentScores(dep.id);
      text += `DEPLOYMENT: "${dep.label}" (${depSessions.length} responses)\n`;
      for (const s of scores) {
        if (s.max > 0) {
          const pct = Math.round((s.avg / s.max) * 100);
          text += `  "${s.prompt}": ${s.avg}/${s.max} (${pct}%)\n`;
        }
      }
      text += `\n`;
    }
    return text;
  }

  async function generateMultiCompareSummary() {
    if (multiCompareAiLoading) return;
    setMultiCompareAiLoading(true);
    setMultiCompareSummary(null);

    const dataText = buildMultiCompareData();
    const systemPrompt = `You analyze a comparison of multiple deployments of the same student feedback survey. Each deployment may represent a different class/teacher.

RULES:
1. ONLY use data provided. Never guess.
2. Quote exact numbers.
3. Keep it concise.

STRUCTURE:
## Overview
1-2 sentences: how many deployments, range of scores, general pattern.

## 🏆 Top Performers
Which deployments scored highest and on what? (max 3)

## ⚠️ Needs Attention
Which deployments scored lowest and on what? (max 3)

## Key Patterns
Any questions where ALL deployments score low or high? Notable outliers?

If response counts are low (<5) for any deployment, flag it.`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: [{ role: "user", content: `Analyze:\n\n${dataText}` }], max_tokens: 1024 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMultiCompareSummary(data.text);
    } catch { setMultiCompareSummary("Failed to generate summary."); }
    finally { setMultiCompareAiLoading(false); }
  }

  // ─── Q&A Chat ───
  async function askQuestion() {
    const q = qaInput.trim();
    if (!q || qaLoading) return;

    const newMessages = [...qaMessages, { role: "user" as const, content: q }];
    setQaMessages(newMessages);
    setQaInput("");
    setQaLoading(true);

    const dataText = buildDataSnapshot();

    const systemPrompt = `You answer questions about student feedback survey data.

RULES:
1. ONLY use the data provided below. Never guess or invent.
2. Quote exact numbers and scores from the data.
3. If the data doesn't contain the answer, say "I don't see that in the data."
4. Keep answers short — 2-4 sentences max.
5. Be direct. No filler.

SURVEY DATA:
${dataText}`;

    try {
      // Build conversation history for context
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: apiMessages,
          max_tokens: 512,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQaMessages([...newMessages, { role: "assistant", content: data.text }]);
    } catch (err: any) {
      setQaMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    } finally {
      setQaLoading(false);
      setTimeout(() => { qaEndRef.current?.scrollIntoView({ behavior: "smooth" }); qaInputRef.current?.focus(); }, 100);
    }
  }

  // ─── CSV Export ───
  function downloadCSV() {
    const headers = ["Session ID", "Deployment", "Language", "Started", "Completed"];
    for (const q of questions) headers.push(q.prompt?.en || q.qKey);
    
    const rows: string[][] = [];
    for (const sess of sessions) {
      const dep = deployments.find((d) => d.id === sess.deploymentId);
      const resps = allResponses.get(sess.id) || [];
      const row: string[] = [
        sess.id,
        dep?.label || sess.deploymentId,
        sess.language,
        sess.startedAt?.toISOString?.() || "",
        sess.completedAt?.toISOString?.() || "",
      ];
      for (const q of questions) {
        const r = resps.find((r) => r.qKey === q.qKey);
        if (!r) { row.push(""); continue; }
        if (r.score !== null && r.score !== undefined) row.push(String(r.score));
        else if (r.responseText) row.push(r.responseText);
        else if (r.response?.value !== undefined) row.push(String(r.response.value));
        else if (r.response?.text) row.push(r.response.text);
        else row.push("");
      }
      rows.push(row);
    }

    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${survey?.title || "survey"}-data-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── PDF Report ───
  async function downloadPDF() {
    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210; const H = 297; const M = 20; const CW = W - M * 2;
    let y = 0; let pageNum = 1;

    const BLUE: [number,number,number] = [0, 120, 212];
    const DARK_BLUE: [number,number,number] = [0, 61, 107];
    const GREEN: [number,number,number] = [30, 122, 46];
    const ORANGE: [number,number,number] = [199, 83, 0];
    const RED: [number,number,number] = [192, 57, 43];
    const GRAY: [number,number,number] = [138, 138, 138];
    const BLK: [number,number,number] = [26, 26, 26];
    const LBGR: [number,number,number] = [248, 249, 250];

    function sClr(score: number, max: number): [number,number,number] {
      const p = max > 0 ? score / max : 0;
      return p >= 0.75 ? GREEN : p >= 0.5 ? ORANGE : RED;
    }

    function hdr(pn: number) {
      pdf.setFillColor(...BLUE); pdf.rect(M, 12, 6, 6, "F");
      pdf.setFontSize(7); pdf.setTextColor(255,255,255); pdf.text("SV", M+1.5, 16.2);
      pdf.setTextColor(...GRAY); pdf.setFontSize(8);
      pdf.text("Student Voice", M+9, 16.2);
      pdf.text(String(pn), W-M, 16.2, { align: "right" });
      pdf.setDrawColor(232,232,232); pdf.line(M, 20, W-M, 20);
      return 28;
    }

    function ftr() {
      pdf.setFontSize(7); pdf.setTextColor(...GRAY);
      pdf.setDrawColor(240,240,240); pdf.line(M, H-15, W-M, H-15);
      pdf.text("Student Voice Report · Confidential", M, H-10);
      pdf.text(new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}), W-M, H-10, {align:"right"});
    }

    function chk(needed: number) {
      if (y + needed > H - 25) { ftr(); pdf.addPage(); pageNum++; y = hdr(pageNum); }
    }

    // ═══ PAGE 1: COVER ═══
    pdf.setFillColor(...BLUE); pdf.rect(0, 0, W, H * 0.75, "F");
    pdf.setFillColor(...DARK_BLUE);
    try { pdf.setGState(new (pdf as any).GState({ opacity: 0.3 })); } catch {}
    pdf.rect(0, H*0.5, W, H*0.25, "F");
    try { pdf.setGState(new (pdf as any).GState({ opacity: 1 })); } catch {}

    // Logo
    pdf.setFillColor(255,255,255);
    try { pdf.setGState(new (pdf as any).GState({ opacity: 0.15 })); } catch {}
    pdf.roundedRect(M, 40, 16, 16, 1, 1, "F");
    try { pdf.setGState(new (pdf as any).GState({ opacity: 1 })); } catch {}
    pdf.setFontSize(10); pdf.setTextColor(255,255,255); pdf.text("SV", M+4.5, 50.5);

    // Title
    pdf.setFontSize(28); pdf.setTextColor(255,255,255);
    pdf.text("Student Feedback Report", M, H*0.65);
    pdf.setFontSize(13);
    try { pdf.setGState(new (pdf as any).GState({ opacity: 0.7 })); } catch {}
    pdf.text(survey?.title || "Survey Report", M, H*0.65+10);
    try { pdf.setGState(new (pdf as any).GState({ opacity: 1 })); } catch {}

    // Metadata
    const metaY = H * 0.82;
    const metas = [
      ["GENERATED", new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})],
      ["RESPONSES", `${completed.length} completed`],
      ["AVG TIME", formatTime(avgTimeSeconds)],
      ["COMMENTS", String(allComments.length)],
    ];
    metas.forEach(([label, value], i) => {
      pdf.setFontSize(7); pdf.setTextColor(...GRAY); pdf.text(label, M, metaY + i*7);
      pdf.setFontSize(9); pdf.setTextColor(...BLK); pdf.text(value, M+28, metaY + i*7);
    });
    ftr();

    // ═══ PAGE 2: SECTION SCORES ═══
    pdf.addPage(); pageNum = 2; y = hdr(pageNum);

    pdf.setFontSize(16); pdf.setTextColor(...BLK); pdf.text("Section Scores", M, y);
    pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.5);
    pdf.line(M, y+2, M + pdf.getTextWidth("Section Scores"), y+2);
    y += 14;

    const allResps: ResponseData[] = []; filteredResponses.forEach((r) => allResps.push(...r)); const secs = computeSectionsFromResponses(allResps);

    for (const sec of secs) {
      chk(14);
      pdf.setFontSize(10); pdf.setTextColor(...BLK); pdf.text(sec.sectionTitle, M, y);
      if (sec.maxScore > 0) {
        const pct = sec.avgScore / sec.maxScore;
        const clr = sClr(sec.avgScore, sec.maxScore);
        pdf.setTextColor(...clr); pdf.text(`${sec.avgScore}/${sec.maxScore}`, W-M, y, {align:"right"});
        y += 4;
        pdf.setFillColor(240,240,240); pdf.roundedRect(M, y, CW, 3, 0.5, 0.5, "F");
        pdf.setFillColor(...clr); pdf.roundedRect(M, y, CW * pct, 3, 0.5, 0.5, "F");
      }
      y += 10;
    }

    // ═══ SECTION BREAKDOWN ═══
    y += 6; chk(20);
    pdf.setFontSize(16); pdf.setTextColor(...BLK); pdf.text("Section Breakdown", M, y);
    pdf.setDrawColor(...BLUE); pdf.line(M, y+2, M + pdf.getTextWidth("Section Breakdown"), y+2);
    y += 14;

    for (const sec of secs) {
      chk(40);

      // Section header
      pdf.setFillColor(...LBGR); pdf.setDrawColor(232,232,232);
      pdf.roundedRect(M, y-4, CW, 10, 1, 1, "FD");
      pdf.setFontSize(11); pdf.setTextColor(...BLK); pdf.text(sec.sectionTitle, M+4, y+2);
      if (sec.maxScore > 0) {
        const clr = sClr(sec.avgScore, sec.maxScore);
        pdf.setTextColor(...clr); pdf.setFontSize(14);
        pdf.text(`${sec.avgScore}/${sec.maxScore}`, W-M-4, y+2, {align:"right"});
      }
      y += 12;

      // Questions
      for (const qs of sec.questionScores) {
        chk(10);
        if (qs.type === "multiple_choice") {
          pdf.setFontSize(8); pdf.setTextColor(...GRAY);
          pdf.text(qs.prompt.slice(0,60), M+4, y);
          pdf.text(`${qs.count} resp`, W-M-4, y, {align:"right"});
          y += 5;
          if (qs.optionCounts) {
            for (const oc of qs.optionCounts) {
              chk(5); pdf.setFontSize(7); pdf.setTextColor(...GRAY);
              pdf.text(`  ${oc.option}: ${oc.count}`, M+6, y); y += 4;
            }
          }
        } else if (qs.maxScore > 0) {
          pdf.setFontSize(8); pdf.setTextColor(85,85,85);
          const promptTxt = qs.prompt.length > 55 ? qs.prompt.slice(0,55)+"..." : qs.prompt;
          pdf.text(promptTxt, M+4, y);
          const clr = sClr(qs.avgScore, qs.maxScore);
          pdf.setTextColor(...clr); pdf.text(`${qs.avgScore}/${qs.maxScore}`, W-M-4, y, {align:"right"});
          y += 3;
          const barW = 50; const barX = W-M-4-barW;
          pdf.setFillColor(240,240,240); pdf.roundedRect(barX, y, barW, 2, 0.3, 0.3, "F");
          pdf.setFillColor(...clr); pdf.roundedRect(barX, y, barW*(qs.avgScore/qs.maxScore), 2, 0.3, 0.3, "F");
          y += 6;
        }
      }

      // Comments (max 5)
      if (sec.comments.length > 0) {
        chk(10); y += 2;
        pdf.setFontSize(7); pdf.setTextColor(...GRAY); pdf.text("COMMENTS", M+4, y); y += 5;
        for (const c of sec.comments.slice(0,5)) {
          chk(8);
          pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.3); pdf.line(M+4, y-2, M+4, y+3);
          pdf.setFontSize(7); pdf.setTextColor(85,85,85);
          const lines = pdf.splitTextToSize(`"${c}"`, CW - 12);
          pdf.text(lines, M+7, y);
          y += lines.length * 3.5 + 2;
        }
        if (sec.comments.length > 5) {
          pdf.setFontSize(7); pdf.setTextColor(...GRAY);
          pdf.text(`+ ${sec.comments.length - 5} more`, M+7, y); y += 4;
        }
      }
      y += 10;
    }

    ftr();
    pdf.save(`${survey?.title || "survey"}-report-${new Date().toISOString().slice(0,10)}.pdf`);
  }

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <header style={{...headerStyle(dark),position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <a href="/admin" style={{display:"flex",alignItems:"center",textDecoration:"none"}}><div style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",background:accentBg(dark),borderRadius:2,color:"#fff",fontSize:11,fontWeight:700}}>SV</div></a>
            <span style={{color:textColor(dark,"tertiary"),fontSize:13}}>/</span>
            <span style={{fontSize:15,fontWeight:600,color:textColor(dark,"primary")}}>{survey.title}</span>
            <span style={badgeStyle(survey.status,dark)}>{survey.status}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={downloadCSV} disabled={filteredSessions.length===0} title="Download CSV" style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.6)",borderRadius:2,cursor:filteredSessions.length>0?"pointer":"default",color:filteredSessions.length>0?textColor(dark,"secondary"):textColor(dark,"tertiary"),opacity:filteredSessions.length>0?1:0.5}}><Download size={15}/></button>
            <button onClick={()=>setShowReportPreview(true)} disabled={filteredSessions.length===0} title="View Report" style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.6)",borderRadius:2,cursor:filteredSessions.length>0?"pointer":"default",color:filteredSessions.length>0?textColor(dark,"secondary"):textColor(dark,"tertiary"),opacity:filteredSessions.length>0?1:0.5}}><FileText size={15}/></button>
            <button disabled title="Share Report — Coming Soon" style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.6)",borderRadius:2,cursor:"default",color:textColor(dark,"tertiary"),opacity:0.4}}><Mail size={15}/></button>
            <button onClick={toggle} style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.6)",borderRadius:2,cursor:"pointer",color:textColor(dark,"secondary")}}>{dark?<Sun size={15}/>:<Moon size={15}/>}</button>
            <a href={`/admin/surveys/${surveyId}/deployments/bulk`} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:"transparent",color:textColor(dark,"secondary"),borderRadius:2,fontSize:13,fontWeight:600,textDecoration:"none"}}>Manage All</a>
            <a href={`/admin/surveys/${surveyId}/deployments/new`} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,textDecoration:"none",transition:"background 0.15s"}} onMouseEnter={(e)=>(e.currentTarget.style.background=accentHoverBg(dark))} onMouseLeave={(e)=>(e.currentTarget.style.background=accentBg(dark))}><Plus size={14}/> New Deployment</a>
          </div>
        </div>
      </header>

      <div style={{maxWidth:960,margin:"0 auto",padding:"24px 24px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:12,marginBottom:32}}>
          {/* Responses tile */}
          <div style={{...glassStyle(dark),padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{color:accentBg(dark)}}><Users size={16}/></span><span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary")}}>Responses</span></div>
            <div style={{fontSize:24,fontWeight:700,color:textColor(dark,"primary"),lineHeight:1,marginBottom:8}}>{completed.length}</div>
            <div style={{display:"flex",gap:12,fontSize:11,color:textColor(dark,"tertiary")}}>
              <span>{filteredSessions.length} opened</span>
            </div>
          </div>
          {/* Avg Time tile */}
          <div style={{...glassStyle(dark),padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{color:accentBg(dark)}}><Clock size={16}/></span><span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary")}}>Avg Time</span></div>
            <div style={{fontSize:24,fontWeight:700,color:textColor(dark,"primary"),lineHeight:1}}>{formatTime(avgTimeSeconds)}</div>
          </div>
          {/* Comments tile */}
          <div style={{...glassStyle(dark),padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{color:accentBg(dark)}}><MessageSquare size={16}/></span><span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary")}}>Comments</span></div>
            <div style={{fontSize:24,fontWeight:700,color:textColor(dark,"primary"),lineHeight:1}}>{allComments.length}</div>
          </div>
        </div>

        {/* Deployments */}
        <div style={{marginBottom:32}}>
          <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:10}}>Deployments</div>
          {deployments.length===0?(
            <div style={{...glassStyle(dark),padding:"24px",textAlign:"center"}}><p style={{fontSize:13,color:textColor(dark,"tertiary"),margin:"0 0 12px"}}>No deployments yet</p><a href={`/admin/surveys/${surveyId}/deployments/new`} style={{fontSize:13,color:accentBg(dark),textDecoration:"none",fontWeight:600}}>Create your first deployment →</a></div>
          ):(
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {deployments.map((dep)=>{
                const depSessions = sessions.filter((s)=>s.deploymentId===dep.id);
                return (
                  <div key={dep.id} style={{...glassStyle(dark),padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                    {dep.deliveryMode==="chatbot"?<MessageSquare size={13} style={{color:accentBg(dark)}}/>:<ClipboardList size={13} style={{color:accentBg(dark)}}/>}
                    <span style={{fontSize:13,fontWeight:500,color:textColor(dark,"primary")}}>{dep.label}</span>
                    <span style={badgeStyle(dep.status,dark)}>{dep.status}</span>
                    {dep.campus&&<span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{dep.campus}</span>}
                    <span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{depSessions.length} responses</span>
                    <a href={`/s/${dep.token}`} target="_blank" rel="noopener noreferrer" style={{color:textColor(dark,"tertiary"),display:"flex"}}><ExternalLink size={12}/></a>
                    <button disabled title="Share link — Coming Soon" style={{background:"none",border:"none",padding:0,display:"flex",color:textColor(dark,"tertiary"),opacity:0.35,cursor:"default"}}><Share2 size={12}/></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${dark?"#333":"#d4d4d4"}`,marginBottom:24}}>
          {tabs.map((tab)=>(<button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",border:"none",background:"transparent",fontFamily:"inherit",transition:"all 0.15s",color:activeTab===tab.key?accentBg(dark):textColor(dark,"tertiary"),borderBottom:activeTab===tab.key?`2px solid ${accentBg(dark)}`:"2px solid transparent",marginBottom:-1}}>{tab.icon} {tab.label}</button>))}
        </div>

        {/* Deployment filter - hide on Compare tab */}
        {deployments.length > 1 && activeTab !== "compare" && (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
            <span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary")}}>Showing</span>
            <select
              value={filterDeployment}
              onChange={(e) => { setFilterDeployment(e.target.value); setAiSummary(null); }}
              style={{
                padding:"6px 12px",fontSize:13,fontFamily:"inherit",fontWeight:500,
                border:`1px solid ${dark?"#444":"#ccc"}`,borderRadius:2,
                background:dark?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.8)",
                color:textColor(dark,"primary"),cursor:"pointer",outline:"none",
              }}
            >
              <option value="all">All deployments ({sessions.length} sessions)</option>
              {deployments.map((d) => {
                const c = sessions.filter((s) => s.deploymentId === d.id).length;
                return <option key={d.id} value={d.id}>{d.label} ({c} sessions)</option>;
              })}
            </select>
          </div>
        )}

        {/* Overview */}
        {activeTab==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {sectionScores.map((sec)=>(
              <div key={sec.section} style={{...glassStyle(dark),padding:0,overflow:"hidden"}}>
                <button onClick={()=>toggleSection(sec.section)} style={{width:"100%",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:14,fontWeight:600,color:textColor(dark,"primary")}}>{sec.sectionTitle}</span>
                    <span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{sec.questionScores.length} Q{sec.comments.length>0?` · ${sec.comments.length} comment${sec.comments.length!==1?"s":""}`:""}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    {sec.maxScore>0&&<><span style={{fontSize:20,fontWeight:700,color:scoreColor(sec.avgScore,sec.maxScore,dark)}}>{sec.avgScore}</span><span style={{fontSize:12,color:textColor(dark,"tertiary")}}>/{sec.maxScore}</span></>}
                    {sec.maxScore===0&&<span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{sec.questionScores.reduce((a,b)=>a+b.count,0)} responses</span>}
                    {expandedSections.has(sec.section)?<ChevronUp size={16} style={{color:textColor(dark,"tertiary")}}/>:<ChevronDown size={16} style={{color:textColor(dark,"tertiary")}}/>}
                  </div>
                </button>
                {expandedSections.has(sec.section)&&(
                  <div style={{padding:"0 20px 16px",borderTop:`1px solid ${dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)"}`}}>
                    <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:12}}>
                      {sec.questionScores.map((qs)=>(
                        <div key={qs.qKey}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:13,color:textColor(dark,"secondary"),flex:1}}>{qs.prompt}</span>
                            {qs.type!=="multiple_choice"&&qs.type!=="open_text"&&qs.type!=="text"&&qs.maxScore>0&&<span style={{fontSize:13,fontWeight:600,color:scoreColor(qs.avgScore,qs.maxScore,dark),marginLeft:12}}>{qs.avgScore}/{qs.maxScore}</span>}
                            {qs.type==="multiple_choice"&&<span style={{fontSize:11,color:textColor(dark,"tertiary"),marginLeft:12}}>{qs.count} responses</span>}
                            {(qs.type==="open_text"||qs.type==="text")&&<span style={{fontSize:11,color:textColor(dark,"tertiary"),marginLeft:12}}>{qs.count} responses</span>}
                          </div>
                          {qs.type!=="multiple_choice"&&qs.type!=="open_text"&&qs.type!=="text"&&qs.maxScore>0&&(
                            <div style={{height:6,background:dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)",borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",width:`${qs.maxScore>0?(qs.avgScore/qs.maxScore)*100:0}%`,background:scoreColor(qs.avgScore,qs.maxScore,dark),borderRadius:1,transition:"width 0.3s ease"}}/></div>
                          )}
                          {qs.type==="multiple_choice"&&qs.optionCounts&&(
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              {qs.optionCounts.map((oc)=>{const pct=qs.count>0?(oc.count/qs.count)*100:0;return(
                                <div key={oc.option}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:12,color:textColor(dark,"secondary")}}>{oc.option}</span><span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{oc.count} ({Math.round(pct)}%)</span></div><div style={{height:4,background:dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)",borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:accentBg(dark),borderRadius:1,transition:"width 0.3s ease"}}/></div></div>
                              );})}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {sec.comments.length>0&&(
                      <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)"}`}}>
                        <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:8}}>Comments</div>
                        {sec.comments.map((c,i)=>(<div key={i} style={{fontSize:13,color:textColor(dark,"secondary"),padding:"8px 12px",marginBottom:4,background:dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)",borderRadius:2,borderLeft:`2px solid ${accentBg(dark)}`}}>&ldquo;{c.text}&rdquo;{c.original&&<div style={{fontSize:11,color:textColor(dark,"tertiary"),marginTop:3,fontStyle:"italic"}}>{c.original}</div>}</div>))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sections grid */}
        {activeTab==="sections"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:12}}>
            {sectionScores.map((sec)=>(
              <div key={sec.section} style={{...glassStyle(dark),padding:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <span style={{fontSize:14,fontWeight:600,color:textColor(dark,"primary")}}>{sec.sectionTitle}</span>
                  {sec.maxScore>0&&<span style={{fontSize:22,fontWeight:700,color:scoreColor(sec.avgScore,sec.maxScore,dark)}}>{sec.avgScore}<span style={{fontSize:12,color:textColor(dark,"tertiary")}}>/{sec.maxScore}</span></span>}
                  {sec.maxScore===0&&<span style={{fontSize:11,color:textColor(dark,"tertiary")}}>{sec.questionScores.reduce((a,b)=>a+b.count,0)} responses</span>}
                </div>
                {sec.questionScores.map((qs)=>(
                  <div key={qs.qKey} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:textColor(dark,"secondary")}}>{qs.prompt}</span>{qs.type!=="multiple_choice"&&qs.type!=="open_text"&&qs.type!=="text"&&qs.maxScore>0&&<span style={{fontSize:12,fontWeight:600,color:scoreColor(qs.avgScore,qs.maxScore,dark)}}>{qs.avgScore}/{qs.maxScore}</span>}{(qs.type==="open_text"||qs.type==="text")&&<span style={{fontSize:10,color:textColor(dark,"tertiary")}}>{qs.count} responses</span>}</div>
                    {qs.type!=="multiple_choice"&&qs.type!=="open_text"&&qs.type!=="text"&&qs.maxScore>0&&<div style={{height:4,background:dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)",borderRadius:1}}><div style={{height:"100%",width:`${qs.maxScore>0?(qs.avgScore/qs.maxScore)*100:0}%`,background:scoreColor(qs.avgScore,qs.maxScore,dark),borderRadius:1}}/></div>}
                    {qs.type==="multiple_choice"&&qs.optionCounts&&<div style={{display:"flex",gap:4,marginTop:2}}>{qs.optionCounts.map((oc)=>(<span key={oc.option} style={{fontSize:10,color:textColor(dark,"tertiary"),padding:"2px 6px",background:dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)",borderRadius:2}}>{oc.option}: {oc.count}</span>))}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Comments */}
        {activeTab==="comments"&&(
          <div>
            {allComments.length===0?(<div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}><p style={{fontSize:14,color:textColor(dark,"tertiary")}}>No comments yet</p></div>):(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {sectionScores.filter((s)=>s.comments.length>0).map((sec)=>(
                  <div key={sec.section}>
                    <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:8,marginTop:16}}>{sec.sectionTitle}</div>
                    {sec.comments.map((c,i)=>(<div key={i} style={{...glassStyle(dark),padding:"12px 16px",marginBottom:4,borderLeft:`2px solid ${accentBg(dark)}`,fontSize:13,color:textColor(dark,"secondary")}}>&ldquo;{c.text}&rdquo;{c.original&&<div style={{fontSize:11,color:textColor(dark,"tertiary"),marginTop:4,fontStyle:"italic"}}>{c.original}</div>}</div>))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compare Deployments */}
        {activeTab==="compare"&&(
          <div>
            {deployments.length < 2 ? (
              <div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}>
                <GitCompareArrows size={32} style={{color:textColor(dark,"tertiary"),marginBottom:16}}/>
                <p style={{fontSize:14,color:textColor(dark,"tertiary")}}>You need at least 2 deployments to compare.</p>
              </div>
            ) : (
              <>
                {/* Mode toggle */}
                <div style={{display:"flex",gap:0,marginBottom:24}}>
                  {([["all","All Deployments"],["1v1","1 vs 1"]] as const).map(([key,label])=>(
                    <button key={key} onClick={()=>setCompareMode(key)}
                      style={{padding:"8px 20px",fontSize:13,fontWeight:600,fontFamily:"inherit",cursor:"pointer",
                        border:`1px solid ${dark?"#333":"#d4d4d4"}`,
                        background:compareMode===key?accentBg(dark):"transparent",
                        color:compareMode===key?"#fff":textColor(dark,"secondary"),
                        borderRadius:key==="all"?"2px 0 0 2px":"0 2px 2px 0",
                        borderLeft:key==="1v1"?"none":undefined,
                      }}>{label}</button>
                  ))}
                </div>

                {/* ═══ ALL DEPLOYMENTS HEATMAP ═══ */}
                {compareMode==="all"&&(()=>{
                  const scoredQs = questions.filter((q)=>q.type!=="open_text"&&q.type!=="text"&&q.type!=="multiple_choice");
                  const depData = deployments.map((dep)=>{
                    const scores = computeDeploymentScores(dep.id);
                    const sessCount = sessions.filter((s)=>s.deploymentId===dep.id).length;
                    return { dep, scores, sessCount };
                  });

                  function heatBg(score: number, max: number): string {
                    if (max===0) return "transparent";
                    const pct = score / max;
                    if (dark) {
                      if (pct>=0.75) return "rgba(93,190,104,0.2)";
                      if (pct>=0.5) return "rgba(240,160,80,0.2)";
                      if (pct>0) return "rgba(240,96,96,0.2)";
                      return "transparent";
                    } else {
                      if (pct>=0.75) return "rgba(30,122,46,0.1)";
                      if (pct>=0.5) return "rgba(199,83,0,0.1)";
                      if (pct>0) return "rgba(192,57,43,0.1)";
                      return "transparent";
                    }
                  }

                  return (
                    <div>
                      {/* Bulk create link */}
                      <div style={{marginBottom:16,display:"flex",justifyContent:"flex-end"}}>
                        <a href={`/admin/surveys/${surveyId}/deployments/bulk`} style={{fontSize:12,color:accentBg(dark),textDecoration:"none",fontWeight:600}}>Manage deployments →</a>
                      </div>

                      {/* Scrollable heatmap */}
                      <div style={{...glassStyle(dark),overflow:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",minWidth:depData.length*80+240}}>
                          <thead>
                            <tr>
                              <th style={{position:"sticky",left:0,zIndex:2,background:dark?"#222":"#f8f9fa",padding:"10px 12px",textAlign:"left",fontSize:10,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"}`,minWidth:200}}>Question</th>
                              {depData.map(({dep,sessCount})=>(
                                <th key={dep.id} style={{padding:"10px 8px",textAlign:"center",fontSize:10,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"}`,minWidth:70,whiteSpace:"nowrap"}}>
                                  <div>{dep.label.length>14?dep.label.slice(0,14)+"…":dep.label}</div>
                                  <div style={{fontSize:9,fontWeight:400,marginTop:2}}>n={sessCount}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {scoredQs.map((q)=>(
                              <tr key={q.qKey}>
                                <td style={{position:"sticky",left:0,zIndex:1,background:dark?"#1e1e1e":"#fff",padding:"8px 12px",fontSize:12,color:textColor(dark,"secondary"),borderBottom:`1px solid ${dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}`}}>
                                  {(q.prompt?.en||q.qKey).length>45?(q.prompt?.en||q.qKey).slice(0,45)+"…":(q.prompt?.en||q.qKey)}
                                </td>
                                {depData.map(({dep,scores})=>{
                                  const s = scores.find((sc)=>sc.qKey===q.qKey);
                                  if (!s||s.max===0) return <td key={dep.id} style={{padding:"8px",textAlign:"center",fontSize:11,color:textColor(dark,"tertiary"),borderBottom:`1px solid ${dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}`}}>—</td>;
                                  return (
                                    <td key={dep.id} style={{padding:"8px",textAlign:"center",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}`,background:heatBg(s.avg,s.max)}}>
                                      <span style={{fontSize:13,fontWeight:600,color:scoreColor(s.avg,s.max,dark)}}>{s.avg}</span>
                                      <span style={{fontSize:9,color:textColor(dark,"tertiary")}}>/{s.max}</span>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            {/* Section averages row */}
                            <tr>
                              <td style={{position:"sticky",left:0,zIndex:1,background:dark?"#222":"#f8f9fa",padding:"10px 12px",fontSize:11,fontWeight:700,color:textColor(dark,"primary"),borderTop:`2px solid ${dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}`}}>Average (all scored Qs)</td>
                              {depData.map(({dep,scores})=>{
                                const scored = scores.filter((s)=>s.max>0&&s.count>0);
                                if (scored.length===0) return <td key={dep.id} style={{padding:"10px 8px",textAlign:"center",fontSize:11,color:textColor(dark,"tertiary"),borderTop:`2px solid ${dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}`,background:dark?"#222":"#f8f9fa"}}>—</td>;
                                const avgPct = Math.round(scored.reduce((a,s)=>a+(s.avg/s.max),0)/scored.length*100);
                                return (
                                  <td key={dep.id} style={{padding:"10px 8px",textAlign:"center",borderTop:`2px solid ${dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}`,background:dark?"#222":"#f8f9fa"}}>
                                    <span style={{fontSize:14,fontWeight:700,color:avgPct>=75?(dark?"#5dbe68":"#1e7a2e"):avgPct>=50?(dark?"#f0a050":"#c75300"):(dark?"#f06060":"#c0392b")}}>{avgPct}%</span>
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Legend */}
                      <div style={{display:"flex",gap:16,marginTop:12,fontSize:11,color:textColor(dark,"tertiary")}}>
                        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:1,background:dark?"rgba(93,190,104,0.2)":"rgba(30,122,46,0.1)"}}/> ≥75%</span>
                        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:1,background:dark?"rgba(240,160,80,0.2)":"rgba(199,83,0,0.1)"}}/> 50–74%</span>
                        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:12,borderRadius:1,background:dark?"rgba(240,96,96,0.2)":"rgba(192,57,43,0.1)"}}/> &lt;50%</span>
                      </div>

                      {/* AI Multi-Compare */}
                      <div style={{marginTop:24}}>
                        {!multiCompareSummary && !multiCompareAiLoading && (
                          <button onClick={generateMultiCompareSummary}
                            style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                            onMouseEnter={(e)=>(e.currentTarget.style.background=accentHoverBg(dark))}
                            onMouseLeave={(e)=>(e.currentTarget.style.background=accentBg(dark))}
                          ><Sparkles size={14}/> AI Summary — All Deployments</button>
                        )}

                        {multiCompareAiLoading && (
                          <div style={{...glassStyle(dark),padding:"32px 24px",textAlign:"center"}}>
                            <div style={{width:24,height:24,borderRadius:"50%",border:`3px solid ${accentBg(dark)}22`,borderTopColor:accentBg(dark),animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
                            <p style={{fontSize:13,color:textColor(dark,"secondary")}}>Analyzing {deployments.length} deployments...</p>
                          </div>
                        )}

                        {multiCompareSummary && (
                          <div>
                            <div style={{...glassStyle(dark),padding:"24px 28px",marginBottom:12}}>
                              <div style={{fontSize:13,lineHeight:1.75,color:textColor(dark,"primary")}}>
                                {renderSummaryBlock(multiCompareSummary, dark, accentBg)}
                              </div>
                            </div>
                            <button onClick={()=>{setMultiCompareSummary(null);generateMultiCompareSummary();}} style={{fontSize:12,color:accentBg(dark),background:"none",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                              <Sparkles size={12}/> Regenerate
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ═══ 1 vs 1 COMPARISON ═══ */}
                {compareMode==="1v1"&&(
                  <>
                    <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:200}}>
                        <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:6}}>Deployment A</div>
                        <select value={compareA} onChange={(e)=>{setCompareA(e.target.value);setCompareSummary(null);}}
                          style={{width:"100%",padding:"10px 14px",fontSize:13,fontFamily:"inherit",background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.7)",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",cursor:"pointer"}}>
                          <option value="">Select deployment...</option>
                          {deployments.map((d)=>{const c=sessions.filter((s)=>s.deploymentId===d.id).length;return <option key={d.id} value={d.id}>{d.label} ({c} responses)</option>;})}
                        </select>
                      </div>
                      <div style={{display:"flex",alignItems:"flex-end",paddingBottom:8}}><span style={{fontSize:13,fontWeight:600,color:textColor(dark,"tertiary")}}>vs</span></div>
                      <div style={{flex:1,minWidth:200}}>
                        <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:6}}>Deployment B</div>
                        <select value={compareB} onChange={(e)=>{setCompareB(e.target.value);setCompareSummary(null);}}
                          style={{width:"100%",padding:"10px 14px",fontSize:13,fontFamily:"inherit",background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.7)",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",cursor:"pointer"}}>
                          <option value="">Select deployment...</option>
                          {deployments.map((d)=>{const c=sessions.filter((s)=>s.deploymentId===d.id).length;return <option key={d.id} value={d.id}>{d.label} ({c} responses)</option>;})}
                        </select>
                      </div>
                    </div>

                    {compareA && compareB && compareA !== compareB && (() => {
                      const scoresA = computeDeploymentScores(compareA);
                      const scoresB = computeDeploymentScores(compareB);
                      const depA = deployments.find((d) => d.id === compareA);
                      const depB = deployments.find((d) => d.id === compareB);
                      const sessCountA = sessions.filter((s) => s.deploymentId === compareA).length;
                      const sessCountB = sessions.filter((s) => s.deploymentId === compareB).length;

                      return (
                        <div>
                          <div style={{display:"flex",gap:12,marginBottom:16}}>
                            <div style={{...glassStyle(dark),padding:"12px 16px",flex:1,textAlign:"center"}}>
                              <div style={{fontSize:11,color:textColor(dark,"tertiary"),fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>{depA?.label}</div>
                              <div style={{fontSize:22,fontWeight:700,color:textColor(dark,"primary")}}>{sessCountA}</div>
                              <div style={{fontSize:11,color:textColor(dark,"tertiary")}}>responses</div>
                            </div>
                            <div style={{...glassStyle(dark),padding:"12px 16px",flex:1,textAlign:"center"}}>
                              <div style={{fontSize:11,color:textColor(dark,"tertiary"),fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>{depB?.label}</div>
                              <div style={{fontSize:22,fontWeight:700,color:textColor(dark,"primary")}}>{sessCountB}</div>
                              <div style={{fontSize:11,color:textColor(dark,"tertiary")}}>responses</div>
                            </div>
                          </div>

                          <div style={{...glassStyle(dark),overflow:"hidden"}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 80px 40px 80px",gap:0,padding:"12px 20px",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"}`,background:dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"}}>
                              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em"}}>Question</div>
                              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"center"}}>{depA?.label?.slice(0,12)}</div>
                              <div/>
                              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"center"}}>{depB?.label?.slice(0,12)}</div>
                            </div>
                            {scoresA.map((a) => {
                              const b = scoresB.find((s) => s.qKey === a.qKey);
                              if (!b) return null;
                              const diff = Math.round((a.avg - b.avg) * 100) / 100;
                              const significant = Math.abs(diff) >= 0.3;
                              let arrowIcon = <Minus size={14} style={{color:textColor(dark,"tertiary")}}/>;
                              if (significant && diff > 0) arrowIcon = <ArrowUp size={14} style={{color:dark?"#5dbe68":"#1e7a2e"}}/>;
                              else if (significant && diff < 0) arrowIcon = <ArrowDown size={14} style={{color:dark?"#f06060":"#c0392b"}}/>;
                              return (
                                <div key={a.qKey} style={{display:"grid",gridTemplateColumns:"1fr 80px 40px 80px",gap:0,padding:"12px 20px",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}`,alignItems:"center"}}>
                                  <div style={{fontSize:13,color:textColor(dark,"secondary"),paddingRight:12}}>{a.prompt}</div>
                                  <div style={{textAlign:"center"}}><span style={{fontSize:14,fontWeight:600,color:scoreColor(a.avg,a.max,dark)}}>{a.avg}</span><span style={{fontSize:11,color:textColor(dark,"tertiary")}}>/{a.max}</span>{a.count<5&&<div style={{fontSize:9,color:textColor(dark,"tertiary")}}>n={a.count}</div>}</div>
                                  <div style={{textAlign:"center",display:"flex",justifyContent:"center"}}>{arrowIcon}</div>
                                  <div style={{textAlign:"center"}}><span style={{fontSize:14,fontWeight:600,color:scoreColor(b.avg,b.max,dark)}}>{b.avg}</span><span style={{fontSize:11,color:textColor(dark,"tertiary")}}>/{b.max}</span>{b.count<5&&<div style={{fontSize:9,color:textColor(dark,"tertiary")}}>n={b.count}</div>}</div>
                                </div>
                              );
                            })}
                          </div>

                          <div style={{marginTop:20}}>
                            {!compareSummary && !compareAiLoading && (
                              <button onClick={generateCompareSummary} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 20px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                                onMouseEnter={(e)=>(e.currentTarget.style.background=accentHoverBg(dark))}
                                onMouseLeave={(e)=>(e.currentTarget.style.background=accentBg(dark))}
                              ><Sparkles size={14}/> AI Comparison Summary</button>
                            )}
                            {compareAiLoading && (
                              <div style={{...glassStyle(dark),padding:"32px 24px",textAlign:"center"}}>
                                <div style={{width:24,height:24,borderRadius:"50%",border:`3px solid ${accentBg(dark)}22`,borderTopColor:accentBg(dark),animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
                                <p style={{fontSize:13,color:textColor(dark,"secondary")}}>Comparing deployments...</p>
                              </div>
                            )}
                            {compareSummary && (
                              <div>
                                <div style={{...glassStyle(dark),padding:"24px 28px",marginBottom:12}}>
                                  <div style={{fontSize:13,lineHeight:1.75,color:textColor(dark,"primary")}}>
                                    {renderSummaryBlock(compareSummary, dark, accentBg)}
                                  </div>
                                </div>
                                <button onClick={()=>{setCompareSummary(null);generateCompareSummary();}} style={{fontSize:12,color:accentBg(dark),background:"none",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Sparkles size={12}/> Regenerate</button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {compareA && compareB && compareA === compareB && (
                      <div style={{...glassStyle(dark),padding:"24px",textAlign:"center"}}><p style={{fontSize:13,color:textColor(dark,"tertiary")}}>Select two different deployments to compare.</p></div>
                    )}
                    {(!compareA || !compareB) && (
                      <div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}><p style={{fontSize:13,color:textColor(dark,"tertiary")}}>Select two deployments above to compare scores.</p></div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* AI Summary */}
        {activeTab==="ai"&&(
          <div>
            {!aiSummary && !aiLoading && !aiError && (
              <div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}>
                <Sparkles size={32} style={{color:accentBg(dark),marginBottom:16}}/>
                <h3 style={{fontSize:16,fontWeight:600,color:textColor(dark,"primary"),margin:"0 0 8px"}}>AI-Powered Summary</h3>
                <p style={{fontSize:13,color:textColor(dark,"tertiary"),margin:"0 0 20px",maxWidth:400,marginLeft:"auto",marginRight:"auto"}}>
                  Generates an analysis based on {sessions.length} response{sessions.length!==1?"s":""} with green, orange, and red flags.
                </p>
                <button
                  onClick={generateAISummary}
                  disabled={sessions.length===0}
                  style={{
                    display:"inline-flex",alignItems:"center",gap:8,padding:"12px 24px",
                    background:sessions.length>0?accentBg(dark):(dark?"#333":"#ddd"),
                    color:sessions.length>0?"#fff":textColor(dark,"tertiary"),
                    borderRadius:2,fontSize:14,fontWeight:600,border:"none",cursor:sessions.length>0?"pointer":"default",
                    fontFamily:"inherit",transition:"background 0.15s",
                  }}
                  onMouseEnter={(e)=>sessions.length>0&&(e.currentTarget.style.background=accentHoverBg(dark))}
                  onMouseLeave={(e)=>sessions.length>0&&(e.currentTarget.style.background=accentBg(dark))}
                >
                  <Sparkles size={16}/> Generate Summary
                </button>
                {sessions.length===0&&<p style={{fontSize:12,color:dark?"#f06060":"#c0392b",marginTop:12}}>No responses to analyze yet</p>}
              </div>
            )}

            {aiLoading && (
              <div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}>
                <div style={{width:32,height:32,borderRadius:"50%",border:`3px solid ${accentBg(dark)}22`,borderTopColor:accentBg(dark),animation:"spin 0.8s linear infinite",margin:"0 auto 16px"}}/>
                <p style={{fontSize:14,color:textColor(dark,"secondary")}}>Analyzing {sessions.length} responses...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {aiError && (
              <div style={{...glassStyle(dark),padding:"24px",borderLeft:"2px solid #c0392b"}}>
                <p style={{fontSize:13,color:dark?"#f06060":"#c0392b",margin:"0 0 12px"}}>{aiError}</p>
                <button onClick={generateAISummary} style={{fontSize:13,color:accentBg(dark),background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Try again</button>
              </div>
            )}

            {aiSummary && (
              <div>
                <div style={{...glassStyle(dark),padding:"24px 28px",marginBottom:12}}>
                  <div style={{fontSize:13,lineHeight:1.75,color:textColor(dark,"primary")}}>
                    {renderSummaryBlock(aiSummary, dark, accentBg)}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setAiSummary(null);generateAISummary();}} style={{fontSize:12,color:accentBg(dark),background:"none",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    <Sparkles size={12}/> Regenerate
                  </button>
                </div>

                {/* Q&A Chat */}
                <div style={{marginTop:24}}>
                  <div style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:textColor(dark,"tertiary"),marginBottom:12}}>Ask about this data</div>

                  {/* Messages */}
                  {qaMessages.length > 0 && (
                    <div style={{...glassStyle(dark),padding:16,marginBottom:12,maxHeight:400,overflowY:"auto"}}>
                      {qaMessages.map((msg, i) => (
                        <div key={i} style={{marginBottom:i<qaMessages.length-1?12:0}}>
                          <div style={{fontSize:11,fontWeight:600,color:msg.role==="user"?accentBg(dark):textColor(dark,"tertiary"),marginBottom:4,textTransform:"uppercase",letterSpacing:"0.04em"}}>{msg.role==="user"?"You":"AI"}</div>
                          <div style={{fontSize:13,lineHeight:1.6,color:textColor(dark,msg.role==="user"?"primary":"secondary"),padding:msg.role==="assistant"?"10px 14px":undefined,background:msg.role==="assistant"?(dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)"):undefined,borderRadius:msg.role==="assistant"?2:undefined,borderLeft:msg.role==="assistant"?`2px solid ${accentBg(dark)}`:undefined,whiteSpace:"pre-wrap"}}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {qaLoading && (
                        <div style={{marginTop:12}}>
                          <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),marginBottom:4,textTransform:"uppercase",letterSpacing:"0.04em"}}>AI</div>
                          <div style={{display:"flex",gap:4,padding:"10px 14px",background:dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)",borderRadius:2,borderLeft:`2px solid ${accentBg(dark)}`}}>
                            {[0,1,2].map((j)=>(<div key={j} style={{width:6,height:6,borderRadius:"50%",background:textColor(dark,"tertiary"),animation:`qaBounce 1.2s ease-in-out ${j*0.15}s infinite`}}/>))}
                          </div>
                        </div>
                      )}
                      <div ref={qaEndRef}/>
                    </div>
                  )}

                  {/* Input */}
                  <div style={{display:"flex",gap:8}}>
                    <input
                      ref={qaInputRef}
                      type="text"
                      value={qaInput}
                      onChange={(e)=>setQaInput(e.target.value)}
                      onKeyDown={(e)=>e.key==="Enter"&&askQuestion()}
                      placeholder="e.g. What did students say about the teacher?"
                      disabled={qaLoading}
                      style={{
                        flex:1,padding:"10px 14px",fontSize:13,fontFamily:"inherit",
                        background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.7)",
                        border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,
                        color:textColor(dark,"primary"),outline:"none",transition:"border-color 0.15s",
                      }}
                      onFocus={(e)=>(e.target.style.borderColor=accentBg(dark))}
                      onBlur={(e)=>(e.target.style.borderColor=dark?"#333":"#d4d4d4")}
                    />
                    <button
                      onClick={askQuestion}
                      disabled={!qaInput.trim()||qaLoading}
                      style={{
                        padding:"10px 16px",fontSize:13,fontWeight:600,fontFamily:"inherit",
                        background:qaInput.trim()&&!qaLoading?accentBg(dark):(dark?"#333":"#ddd"),
                        color:qaInput.trim()&&!qaLoading?"#fff":textColor(dark,"tertiary"),
                        border:"none",borderRadius:2,cursor:qaInput.trim()&&!qaLoading?"pointer":"default",
                        transition:"background 0.15s",
                      }}
                      onMouseEnter={(e)=>qaInput.trim()&&!qaLoading&&(e.currentTarget.style.background=accentHoverBg(dark))}
                      onMouseLeave={(e)=>qaInput.trim()&&!qaLoading&&(e.currentTarget.style.background=accentBg(dark))}
                    >Ask</button>
                  </div>
                  <style>{`@keyframes qaBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }`}</style>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report Preview Modal */}
      {showReportPreview && (() => {
        // Generate report content on open
        if (!reportContent) {
          const depLabel = filterDeployment === "all" ? "All Deployments" : deployments.find((d) => d.id === filterDeployment)?.label || "";
          let text = `# ${survey?.title} — Survey Report\n`;
          text += `**Date:** ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}\n`;
          text += `**Deployment:** ${depLabel}\n`;
          text += `**Responses:** ${completed.length} completed (${filteredSessions.length} opened)\n`;
          if (avgTimeSeconds > 0) text += `**Avg Completion Time:** ${formatTime(avgTimeSeconds)}\n`;
          if (overallAvg > 0) text += `**Overall Score:** ${overallAvg}%\n`;
          text += `\n---\n\n`;

          for (const sec of sectionScores) {
            text += `## ${sec.sectionTitle}`;
            if (sec.maxScore > 0) text += ` — ${sec.avgScore}/${sec.maxScore}`;
            text += `\n\n`;
            for (const qs of sec.questionScores) {
              if (qs.type !== "multiple_choice" && qs.type !== "open_text" && qs.type !== "text" && qs.maxScore > 0) {
                text += `- **${qs.prompt}:** ${qs.avgScore}/${qs.maxScore}\n`;
              } else if (qs.type === "multiple_choice" && qs.optionCounts) {
                text += `- **${qs.prompt}:** ${qs.optionCounts.map((oc) => `${oc.option} (${oc.count})`).join(", ")}\n`;
              } else if (qs.type === "open_text" || qs.type === "text") {
                text += `- **${qs.prompt}:** ${qs.count} responses\n`;
              }
            }
            if (sec.comments.length > 0) {
              text += `\n**Comments:**\n`;
              sec.comments.forEach((c) => { text += `> "${c.text}"${c.original ? ` _(${c.original})_` : ""}\n`; });
            }
            text += `\n`;
          }

          if (aiSummary) {
            text += `---\n\n## AI Analysis\n\n${aiSummary}\n`;
          }

          setTimeout(() => setReportContent(text), 0);
        }

        // Render markdown to styled HTML
        function renderReport(md: string) {
          return md.split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} style={{ height: 8 }} />;
            if (trimmed === "---") return <hr key={i} style={{ border: "none", borderTop: `1px solid ${dark ? "#333" : "#e0e0e0"}`, margin: "16px 0" }} />;
            if (trimmed.startsWith("# ")) return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: textColor(dark, "primary"), margin: "0 0 8px", letterSpacing: "-0.02em" }}>{trimmed.slice(2)}</h1>;
            if (trimmed.startsWith("## ")) {
              const text = trimmed.slice(3);
              const hasScore = text.includes(" — ");
              return (
                <h2 key={i} style={{ fontSize: 16, fontWeight: 700, color: textColor(dark, "primary"), margin: "20px 0 8px", paddingBottom: 6, borderBottom: `2px solid ${accentBg(dark)}22` }}>
                  {hasScore ? <>{text.split(" — ")[0]} <span style={{ color: accentBg(dark), fontWeight: 600 }}>— {text.split(" — ")[1]}</span></> : text}
                </h2>
              );
            }
            if (trimmed.startsWith("> ")) return <div key={i} style={{ padding: "8px 14px", margin: "4px 0", borderLeft: `3px solid ${accentBg(dark)}`, background: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: "0 4px 4px 0", fontSize: 13, color: textColor(dark, "secondary"), fontStyle: "italic" }}>{trimmed.slice(2)}</div>;
            if (trimmed.startsWith("- **")) {
              const match = trimmed.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
              if (match) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: textColor(dark, "primary") }}>{match[1]}</span>
                    <span style={{ fontSize: 13, color: textColor(dark, "secondary"), textAlign: "right", marginLeft: 12 }}>{match[2]}</span>
                  </div>
                );
              }
            }
            // Bold inline
            const parts = trimmed.split(/\*\*(.+?)\*\*/g);
            return <p key={i} style={{ fontSize: 13, color: textColor(dark, "secondary"), margin: "3px 0", lineHeight: 1.6 }}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ fontWeight: 600, color: textColor(dark, "primary") }}>{p}</strong> : p)}</p>;
          });
        }

        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }} onClick={(e) => { if (e.target === e.currentTarget) { setShowReportPreview(false); setReportContent(""); setReportEditMode(false); } }}>
            <div style={{
              width: "100%", maxWidth: 680, maxHeight: "90vh",
              background: dark ? "#1e1e1e" : "#fff",
              borderRadius: 6, boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: `1px solid ${dark ? "#333" : "#e5e5e5"}`,
                background: dark ? "#252525" : "#fafafa",
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: textColor(dark, "primary") }}>Report</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => setReportEditMode(!reportEditMode)} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    border: `1px solid ${dark ? "#444" : "#ccc"}`, borderRadius: 2, cursor: "pointer",
                    background: reportEditMode ? accentBg(dark) : "transparent",
                    color: reportEditMode ? "#fff" : textColor(dark, "secondary"),
                  }}><Edit3 size={11}/> {reportEditMode ? "Done" : "Edit"}</button>
                  <button onClick={() => { downloadPDF(); }} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    border: "none", borderRadius: 2, cursor: "pointer",
                    background: accentBg(dark), color: "#fff",
                  }}><Download size={11}/> PDF</button>
                  <button disabled title="Share — Coming Soon" style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                    border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, borderRadius: 2,
                    background: "transparent", color: textColor(dark, "tertiary"),
                    cursor: "default", opacity: 0.4,
                  }}><Mail size={11}/> Share</button>
                  <button onClick={() => { setShowReportPreview(false); setReportContent(""); setReportEditMode(false); }} style={{
                    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", background: "transparent", cursor: "pointer",
                    color: textColor(dark, "tertiary"), fontSize: 16, marginLeft: 4,
                  }}>✕</button>
                </div>
              </div>
              {/* Content */}
              {reportEditMode ? (
                <textarea
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  style={{
                    flex: 1, padding: "24px 28px", fontSize: 13, lineHeight: 1.8,
                    fontFamily: "monospace",
                    border: "none", outline: "none", resize: "none",
                    background: dark ? "#1a1a1a" : "#f8f8f8",
                    color: textColor(dark, "primary"),
                    overflowY: "auto",
                  }}
                />
              ) : (
                <div style={{
                  flex: 1, padding: "28px 32px", overflowY: "auto",
                  background: dark ? "#1e1e1e" : "#fff",
                }}>
                  {renderReport(reportContent)}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}