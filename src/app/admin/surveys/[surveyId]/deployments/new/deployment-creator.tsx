"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useTheme } from "@/components/theme-provider";
import {
  ArrowLeft,
  Sun,
  Moon,
  Link2,
  QrCode,
  Copy,
  Check,
  MessageSquare,
  ClipboardList,
  ExternalLink,
} from "lucide-react";

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
    width: "100%", padding: "10px 12px", fontSize: 14, fontFamily: "inherit",
    background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
    border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, borderRadius: 2,
    color: textColor(dark, "primary"), outline: "none", transition: "border-color 0.15s",
  };
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

function labelStyle(dark: boolean): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: textColor(dark, "secondary"), marginBottom: 6, display: "block" };
}

function microLabel(dark: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: textColor(dark, "tertiary") };
}

// ─── Helpers ───
function generateToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function getQRUrl(token: string): string {
  const url = encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}`;
}

type DeliveryMode = "form" | "chatbot";

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export function DeploymentCreator({ surveyId }: { surveyId: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  const [surveyTitle, setSurveyTitle] = useState("");
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [label, setLabel] = useState("");
  const [campus, setCampus] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("form");

  // Created state
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => { loadSurvey(); }, [surveyId]);

  async function loadSurvey() {
    try {
      const surveyDoc = await getDoc(doc(db, "surveys", surveyId));
      if (!surveyDoc.exists()) return;
      setSurveyTitle(surveyDoc.data().title || "Untitled Survey");

      // Find published version
      const versionsSnap = await getDocs(
        query(collection(db, `surveys/${surveyId}/versions`), where("status", "==", "published"))
      );
      if (!versionsSnap.empty) {
        setVersionId(versionsSnap.docs[0].id);
      }
    } catch (err) {
      console.error("Failed to load survey:", err);
    } finally {
      setLoading(false);
    }
  }

  async function createDeployment() {
    if (!label.trim()) return;
    if (!versionId) return;
    setCreating(true);

    try {
      const token = generateToken();
      const depRef = doc(collection(db, "deployments"));

      await setDoc(depRef, {
        surveyId,
        versionId,
        token,
        label: label.trim(),
        campus: campus.trim() || null,
        deliveryMode,
        status: "live",
        createdAt: serverTimestamp(),
      });

      setCreatedToken(token);
      setCreatedId(depRef.id);
    } catch (err) {
      console.error("Failed to create deployment:", err);
    } finally {
      setCreating(false);
    }
  }

  function copyLink() {
    if (!createdToken) return;
    const url = `${window.location.origin}/s/${createdToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const surveyUrl = createdToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${createdToken}` : "";

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: textColor(dark, "tertiary"), fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ ...headerStyle(dark), position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/admin" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
              <div style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: dark ? "#4da6ff" : "#0078d4", borderRadius: 2, color: "#fff", fontSize: 11, fontWeight: 700,
              }}>SV</div>
            </a>
            <span style={{ color: textColor(dark, "tertiary"), fontSize: 13 }}>/</span>
            <a href={`/admin/surveys/${surveyId}`} style={{ fontSize: 15, fontWeight: 600, color: textColor(dark, "primary"), textDecoration: "none" }}>
              {surveyTitle}
            </a>
            <span style={{ color: textColor(dark, "tertiary"), fontSize: 13 }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: textColor(dark, "secondary") }}>
              New Deployment
            </span>
          </div>
          <button onClick={toggle} style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.6)",
            borderRadius: 2, cursor: "pointer", color: textColor(dark, "secondary"),
          }}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 24px" }}>

        {/* ─── CREATE FORM ─── */}
        {!createdToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>Create Deployment</h2>
              <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>
                A deployment generates a unique link for students to access this survey
              </p>
            </div>

            <div style={{ ...glassStyle(dark), padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Label */}
              <div>
                <label style={labelStyle(dark)}>Deployment Label *</label>
                <input style={inputStyle(dark)} placeholder="e.g. B1 Evening - Feb 2026"
                  value={label} onChange={(e) => setLabel(e.target.value)} />
                <p style={{ fontSize: 11, color: textColor(dark, "tertiary"), marginTop: 4 }}>
                  A name to identify this deployment in your dashboard
                </p>
              </div>

              {/* Campus */}
              <div>
                <label style={labelStyle(dark)}>Campus (optional)</label>
                <input style={inputStyle(dark)} placeholder="e.g. Dubai, London"
                  value={campus} onChange={(e) => setCampus(e.target.value)} />
              </div>

              {/* Delivery Mode */}
              <div>
                <label style={labelStyle(dark)}>Delivery Mode</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {/* Form option */}
                  <button
                    onClick={() => setDeliveryMode("form")}
                    style={{
                      ...glassStyle(dark),
                      padding: 16,
                      cursor: "pointer",
                      textAlign: "left" as const,
                      border: deliveryMode === "form"
                        ? `2px solid ${accentBg(dark)}`
                        : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)"}`,
                      background: deliveryMode === "form"
                        ? (dark ? "rgba(77,166,255,0.08)" : "rgba(0,120,212,0.06)")
                        : (dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.4)"),
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <ClipboardList size={18} style={{ color: deliveryMode === "form" ? accentBg(dark) : textColor(dark, "tertiary") }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: deliveryMode === "form" ? accentBg(dark) : textColor(dark, "primary") }}>
                        Basic Survey
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: textColor(dark, "secondary"), margin: 0, lineHeight: 1.4 }}>
                      Clean form-style interface. Students see questions one section at a time and tap through.
                    </p>
                  </button>

                  {/* Chatbot option */}
                  <button
                    onClick={() => setDeliveryMode("chatbot")}
                    style={{
                      ...glassStyle(dark),
                      padding: 16,
                      cursor: "pointer",
                      textAlign: "left" as const,
                      border: deliveryMode === "chatbot"
                        ? `2px solid ${accentBg(dark)}`
                        : `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)"}`,
                      background: deliveryMode === "chatbot"
                        ? (dark ? "rgba(77,166,255,0.08)" : "rgba(0,120,212,0.06)")
                        : (dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.4)"),
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <MessageSquare size={18} style={{ color: deliveryMode === "chatbot" ? accentBg(dark) : textColor(dark, "tertiary") }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: deliveryMode === "chatbot" ? accentBg(dark) : textColor(dark, "primary") }}>
                        AI Chatbot
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: textColor(dark, "secondary"), margin: 0, lineHeight: 1.4 }}>
                      Conversational AI guides students through questions naturally. Translates and adapts tone.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <a href={`/admin/surveys/${surveyId}`} style={{ ...btnSecondary(dark), textDecoration: "none" }}>
                <ArrowLeft size={14} /> Cancel
              </a>
              <button
                style={{ ...btnPrimary(dark), opacity: (!label.trim() || !versionId || creating) ? 0.5 : 1 }}
                onClick={createDeployment}
                disabled={!label.trim() || !versionId || creating}
                onMouseEnter={(e) => label.trim() && !creating && (e.currentTarget.style.background = accentHoverBg(dark))}
                onMouseLeave={(e) => label.trim() && !creating && (e.currentTarget.style.background = accentBg(dark))}
              >
                {creating ? "Creating..." : "Generate Link"} <Link2 size={14} />
              </button>
            </div>

            {!versionId && (
              <div style={{ ...glassStyle(dark), padding: 16, borderLeft: "2px solid #c0392b" }}>
                <p style={{ fontSize: 13, color: dark ? "#f06060" : "#c0392b", margin: 0 }}>
                  No published version found for this survey. Publish the survey first.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── SUCCESS ─── */}
        {createdToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Success header */}
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: accentBg(dark),
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
              }}>
                <Check size={28} color="#fff" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: textColor(dark, "primary"), margin: 0 }}>
                Deployment Created!
              </h2>
              <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginTop: 4 }}>
                Share this link with your students
              </p>
            </div>

            {/* Details card */}
            <div style={{ ...glassStyle(dark), padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={microLabel(dark)}>Label</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: textColor(dark, "primary"), marginTop: 4 }}>{label}</div>
                </div>
                <div>
                  <div style={microLabel(dark)}>Mode</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    {deliveryMode === "chatbot" ? <MessageSquare size={14} /> : <ClipboardList size={14} />}
                    <span style={{ fontSize: 14, color: textColor(dark, "primary") }}>
                      {deliveryMode === "chatbot" ? "AI Chatbot" : "Basic Survey"}
                    </span>
                  </div>
                </div>
                {campus && (
                  <div>
                    <div style={microLabel(dark)}>Campus</div>
                    <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4 }}>{campus}</div>
                  </div>
                )}
                <div>
                  <div style={microLabel(dark)}>Token</div>
                  <div style={{ fontSize: 14, color: textColor(dark, "primary"), marginTop: 4, fontFamily: "monospace" }}>{createdToken}</div>
                </div>
              </div>

              {/* Link */}
              <div style={{ marginBottom: 20 }}>
                <div style={microLabel(dark)}>Survey Link</div>
                <div style={{
                  marginTop: 6, display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px", borderRadius: 2,
                  background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                  border: `1px solid ${dark ? "#333" : "#d4d4d4"}`,
                }}>
                  <span style={{ fontSize: 13, color: accentBg(dark), flex: 1, fontFamily: "monospace", wordBreak: "break-all" as const }}>
                    {surveyUrl}
                  </span>
                  <button onClick={copyLink} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: copied ? "#5dbe68" : textColor(dark, "secondary"),
                    display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                  }}>
                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                  </button>
                </div>
              </div>

              {/* QR Code */}
              <div style={{ textAlign: "center" }}>
                <div style={{ ...microLabel(dark), marginBottom: 12 }}>QR Code</div>
                <div style={{
                  display: "inline-block", padding: 12, borderRadius: 2,
                  background: "#ffffff", border: "1px solid #e0e0e0",
                }}>
                  <img src={getQRUrl(createdToken)} alt="QR Code" width={180} height={180} style={{ display: "block" }} />
                </div>
                <p style={{ fontSize: 11, color: textColor(dark, "tertiary"), marginTop: 8 }}>
                  Students can scan this to open the survey
                </p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <a href={surveyUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...btnPrimary(dark), textDecoration: "none" }}>
                Open Survey <ExternalLink size={14} />
              </a>
              <a href={`/admin/surveys/${surveyId}`}
                style={{ ...btnSecondary(dark), textDecoration: "none" }}>
                Go to Dashboard
              </a>
              <button
                onClick={() => { setCreatedToken(null); setCreatedId(null); setLabel(""); setCampus(""); }}
                style={btnSecondary(dark)}
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}