"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { useTheme } from "@/components/theme-provider";
import { Plus, FileText, Users, ChevronRight, BarChart3, Sun, Moon, Search, Trash2, X } from "lucide-react";

interface SurveyItem {
  id: string;
  title: string;
  status: "draft" | "live" | "archived";
  createdAt: Date;
  sessionCount: number;
  completedCount: number;
  thisWeekCount: number;
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
    transition: "all 0.15s ease",
  };
}

function glassHoverStyle(dark: boolean): React.CSSProperties {
  return {
    background: dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.75)",
    boxShadow: dark ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.08)",
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

function accentBg(dark: boolean) {
  return dark ? "#4da6ff" : "#0078d4";
}

function accentHoverBg(dark: boolean) {
  return dark ? "#3d96ef" : "#106ebe";
}

function textColor(dark: boolean, level: "primary" | "secondary" | "tertiary") {
  const colors = {
    primary: dark ? "#eaeaea" : "#1a1a1a",
    secondary: dark ? "#a0a0a0" : "#555555",
    tertiary: dark ? "#606060" : "#8a8a8a",
  };
  return colors[level];
}

function badgeStyle(status: string, dark: boolean): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    live: {
      background: dark ? "#162e1a" : "#dff5e3",
      color: dark ? "#5dbe68" : "#1e7a2e",
      border: dark ? "1px solid #2a4d2e" : "1px solid #b8e6c0",
    },
    draft: {
      background: dark ? "#332414" : "#fff3e0",
      color: dark ? "#f0a050" : "#c75300",
      border: dark ? "1px solid #4d3820" : "1px solid #ffd699",
    },
    archived: {
      background: dark ? "#222" : "#f0f0f0",
      color: dark ? "#606060" : "#8a8a8a",
      border: dark ? "1px solid #333" : "1px solid #d4d4d4",
    },
  };
  return {
    ...styles[status] || styles.archived,
    borderRadius: "2px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    padding: "2px 8px",
  };
}

export default function AdminPage() {
  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"live"|"draft"|"archived">("all");
  const [deleteTarget, setDeleteTarget] = useState<SurveyItem|null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadSurveys();
  }, []);

  async function loadSurveys() {
    try {
      const surveySnap = await getDocs(
        query(collection(db, "surveys"), orderBy("createdAt", "desc"))
      );

      const surveyList: SurveyItem[] = [];

      for (const surveyDoc of surveySnap.docs) {
        const data = surveyDoc.data();

        const sessionsSnap = await getDocs(
          query(collection(db, "sessions"), where("surveyId", "==", surveyDoc.id))
        );

        const sessions = sessionsSnap.docs;
        const completed = sessions.filter((s) => s.data().completedAt !== null);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thisWeek = sessions.filter((s) => {
          const started = s.data().startedAt?.toDate?.();
          return started && started >= sevenDaysAgo;
        });

        surveyList.push({
          id: surveyDoc.id,
          title: data.title,
          status: data.status,
          createdAt: data.createdAt?.toDate() || new Date(),
          sessionCount: sessions.length,
          completedCount: completed.length,
          thisWeekCount: thisWeek.length,
        });
      }

      setSurveys(surveyList);
    } catch (err) {
      console.error("Failed to load surveys:", err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: Date) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  async function deleteSurvey(surveyId: string) {
    setDeleting(true);
    try {
      // Delete sessions
      const sessSnap = await getDocs(query(collection(db, "sessions"), where("surveyId", "==", surveyId)));
      for (const sess of sessSnap.docs) {
        const respSnap = await getDocs(collection(db, `sessions/${sess.id}/responses`));
        for (const resp of respSnap.docs) await deleteDoc(resp.ref);
        await deleteDoc(sess.ref);
      }
      // Delete deployments
      const depSnap = await getDocs(query(collection(db, "deployments"), where("surveyId", "==", surveyId)));
      for (const dep of depSnap.docs) await deleteDoc(dep.ref);
      // Delete versions
      const verSnap = await getDocs(collection(db, `surveys/${surveyId}/versions`));
      for (const ver of verSnap.docs) await deleteDoc(ver.ref);
      // Delete survey
      await deleteDoc(doc(db, "surveys", surveyId));
      setSurveys((prev) => prev.filter((s) => s.id !== surveyId));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally { setDeleting(false); }
  }

  // Filtered surveys
  const filteredSurveys = surveys.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!s.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalSessions = surveys.reduce((sum, s) => sum + s.sessionCount, 0);
  const totalCompleted = surveys.reduce((sum, s) => sum + s.completedCount, 0);

  const stats = [
    { key: "surveys", label: "Surveys", value: surveys.length, meta: `${surveys.filter((s) => s.status === "live").length} live`, icon: <FileText size={16} /> },
    { key: "responses", label: "Responses", value: totalSessions, meta: `${totalCompleted} completed`, icon: <Users size={16} /> },
    { key: "thisweek", label: "This Week", value: surveys.reduce((sum, s) => sum + s.thisWeekCount, 0), meta: "responses in last 7 days", icon: <BarChart3 size={16} /> },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ─── Header ─── */}
      <header style={{ ...headerStyle(dark), position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/admin" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <div style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: accentBg(dark), borderRadius: 2, color: "#fff", fontSize: 11, fontWeight: 700,
            }}>
              SV
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: textColor(dark, "primary") }}>
              Student Voice
            </span>
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggle}
              style={{
                width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.6)",
                borderRadius: 2, cursor: "pointer", color: textColor(dark, "secondary"), transition: "all 0.15s",
              }}
              title="Toggle theme"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <a
              href="/admin/surveys/new"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: accentBg(dark), color: "#fff", borderRadius: 2, fontSize: 13,
                fontWeight: 600, textDecoration: "none", letterSpacing: "0.01em", transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = accentHoverBg(dark))}
              onMouseLeave={(e) => (e.currentTarget.style.background = accentBg(dark))}
            >
              <Plus size={14} />
              New Survey
            </a>
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {/* Welcome */}
        <p style={{ fontSize: 13, color: textColor(dark, "tertiary"), marginBottom: 24 }}>
          Welcome back
        </p>

        {/* ─── Stats ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 40 }}>
          {stats.map((stat) => (
            <div
              key={stat.key}
              style={{
                ...glassStyle(dark),
                ...(hoveredStat === stat.key ? glassHoverStyle(dark) : {}),
                padding: 20,
              }}
              onMouseEnter={() => setHoveredStat(stat.key)}
              onMouseLeave={() => setHoveredStat(null)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ color: accentBg(dark) }}>{stat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: textColor(dark, "tertiary") }}>
                  {stat.label}
                </span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: textColor(dark, "primary") }}>
                {loading ? "—" : stat.value}
              </div>
              <div style={{ fontSize: 12, marginTop: 8, color: textColor(dark, "tertiary") }}>
                {loading ? "" : stat.meta}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Survey List ─── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: textColor(dark, "tertiary"), marginBottom: 12 }}>
            Your Surveys
          </div>

          {/* Search & Filter */}
          {!loading && surveys.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: textColor(dark, "tertiary") }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search surveys..."
                  style={{
                    width: "100%", padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
                    background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
                    border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, borderRadius: 2,
                    color: textColor(dark, "primary"), outline: "none", transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = accentBg(dark))}
                  onBlur={(e) => (e.target.style.borderColor = dark ? "#333" : "#d4d4d4")}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: textColor(dark, "tertiary"), padding: 2, display: "flex" }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 0 }}>
                {(["all", "live", "draft", "archived"] as const).map((f) => (
                  <button key={f} onClick={() => setStatusFilter(f)}
                    style={{
                      padding: "8px 14px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                      background: statusFilter === f ? accentBg(dark) : "transparent",
                      color: statusFilter === f ? "#fff" : textColor(dark, "secondary"),
                      border: `1px solid ${dark ? "#333" : "#d4d4d4"}`,
                      borderRadius: f === "all" ? "2px 0 0 2px" : f === "archived" ? "0 2px 2px 0" : 0,
                      borderLeft: f !== "all" ? "none" : undefined,
                      textTransform: "capitalize",
                    }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {[1, 2].map((i) => (
                <div key={i} style={{ ...glassStyle(dark), padding: 20, opacity: 0.5 }}>
                  <div style={{ height: 16, width: 200, background: dark ? "#333" : "#e8e8e8", borderRadius: 2 }} />
                  <div style={{ height: 12, width: 140, background: dark ? "#2a2a2a" : "#f0f0f0", borderRadius: 2, marginTop: 10 }} />
                </div>
              ))}
            </div>
          ) : surveys.length === 0 ? (
            <div style={{ ...glassStyle(dark), padding: "64px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>📋</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: textColor(dark, "primary") }}>No surveys yet</p>
              <p style={{ fontSize: 13, marginTop: 4, color: textColor(dark, "tertiary") }}>
                Create your first survey to start collecting feedback
              </p>
              <a
                href="/admin/surveys/new"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, marginTop: 20,
                  padding: "8px 16px", background: accentBg(dark), color: "#fff", borderRadius: 2,
                  fontSize: 13, fontWeight: 600, textDecoration: "none",
                }}
              >
                <Plus size={14} />
                Create Survey
              </a>
            </div>
          ) : filteredSurveys.length === 0 ? (
            <div style={{ ...glassStyle(dark), padding: "48px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: textColor(dark, "tertiary") }}>No surveys match your search.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filteredSurveys.map((survey) => {
                const isHovered = hoveredId === survey.id;
                return (
                  <div
                    key={survey.id}
                    style={{
                      ...glassStyle(dark),
                      ...(isHovered ? glassHoverStyle(dark) : {}),
                      borderLeft: isHovered ? `2px solid ${accentBg(dark)}` : "2px solid transparent",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={() => setHoveredId(survey.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <a
                      href={`/admin/surveys/${survey.id}`}
                      style={{
                        flex: 1,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: textColor(dark, "primary") }}>
                          {survey.title}
                        </span>
                        <span style={badgeStyle(survey.status, dark)}>
                          {survey.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: textColor(dark, "tertiary") }}>
                        <span>Created {formatDate(survey.createdAt)}</span>
                        <span>·</span>
                        <span>{survey.sessionCount} response{survey.sessionCount !== 1 ? "s" : ""}</span>
                        {survey.sessionCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{Math.round((survey.completedCount / survey.sessionCount) * 100)}% completed</span>
                          </>
                        )}
                      </div>
                    </a>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(survey); }}
                        title="Delete survey"
                        style={{
                          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                          background: "none", border: "none", cursor: "pointer", borderRadius: 2,
                          color: textColor(dark, "tertiary"), opacity: isHovered ? 0.8 : 0, transition: "opacity 0.15s",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight
                        size={16}
                        style={{
                          color: textColor(dark, "tertiary"),
                          opacity: isHovered ? 0.8 : 0.3,
                          transition: "opacity 0.15s",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Delete Confirmation Modal ─── */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => !deleting && setDeleteTarget(null)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
          <div style={{ ...glassStyle(dark), position: "relative", padding: "32px", maxWidth: 420, width: "90%", background: dark ? "#1e1e1e" : "#fff", border: `1px solid ${dark ? "#333" : "#d4d4d4"}` }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: textColor(dark, "primary"), margin: "0 0 12px" }}>Delete Survey</h3>
            <p style={{ fontSize: 13, color: textColor(dark, "secondary"), margin: "0 0 8px", lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>&ldquo;{deleteTarget.title}&rdquo;</strong>?
            </p>
            <p style={{ fontSize: 12, color: dark ? "#f06060" : "#c0392b", margin: "0 0 24px", lineHeight: 1.5 }}>
              This will permanently delete the survey, all {deleteTarget.sessionCount} response{deleteTarget.sessionCount !== 1 ? "s" : ""}, deployments, and versions. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: "transparent", color: textColor(dark, "secondary"), border: `1px solid ${dark ? "#333" : "#d4d4d4"}`, borderRadius: 2, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => deleteSurvey(deleteTarget.id)} disabled={deleting}
                style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: dark ? "#c0392b" : "#e74c3c", color: "#fff", border: "none", borderRadius: 2, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}>
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}