"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { useTheme } from "@/components/theme-provider";
import { ArrowLeft, Sun, Moon, Plus, Trash2, Copy, Check, ExternalLink, MessageSquare, ClipboardList, Save, Loader2 } from "lucide-react";

function glassStyle(dark: boolean): React.CSSProperties { return { background: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.55)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.4)", borderRadius: "2px", boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(0,0,0,0.06)" }; }
function headerStyle(dark: boolean): React.CSSProperties { return { background: dark ? "rgba(30,30,30,0.85)" : "#ffffff", borderBottom: dark ? "1px solid #333" : "1px solid #d4d4d4", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }; }
function accentBg(dark: boolean) { return dark ? "#4da6ff" : "#0078d4"; }
function accentHoverBg(dark: boolean) { return dark ? "#3d96ef" : "#106ebe"; }
function textColor(dark: boolean, level: "primary"|"secondary"|"tertiary") { return ({ primary: dark ? "#eaeaea" : "#1a1a1a", secondary: dark ? "#a0a0a0" : "#555555", tertiary: dark ? "#606060" : "#8a8a8a" })[level]; }

function generateToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let t = "";
  for (let i = 0; i < 8; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

interface DeploymentRow {
  id: string;       // Firestore doc ID (empty for new)
  label: string;
  campus: string;
  deliveryMode: "form" | "chatbot";
  status: "live" | "paused" | "closed";
  token: string;
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
}

export function BulkDeployments({ surveyId }: { surveyId: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [surveyTitle, setSurveyTitle] = useState("");
  const [versionId, setVersionId] = useState<string|null>(null);
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string|null>(null);
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkMode, setBulkMode] = useState<"form"|"chatbot">("form");
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const lastInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, [surveyId]);

  async function loadData() {
    try {
      const surveyDoc = await getDoc(doc(db, "surveys", surveyId));
      if (!surveyDoc.exists()) return;
      setSurveyTitle(surveyDoc.data().title);

      const versionsSnap = await getDocs(query(collection(db, `surveys/${surveyId}/versions`), where("status", "==", "published")));
      if (!versionsSnap.empty) setVersionId(versionsSnap.docs[0].id);

      const depSnap = await getDocs(query(collection(db, "deployments"), where("surveyId", "==", surveyId)));
      const existing: DeploymentRow[] = depSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, label: data.label || "", campus: data.campus || "", deliveryMode: data.deliveryMode || "form",
          status: data.status || "live", token: data.token || "", isNew: false, dirty: false, saving: false,
        };
      });
      setRows(existing);
    } catch (err) { console.error("Load error:", err); }
    finally { setLoading(false); }
  }

  function addRow() {
    setRows((prev) => [...prev, {
      id: "", label: "", campus: "", deliveryMode: "form", status: "live",
      token: generateToken(), isNew: true, dirty: true, saving: false,
    }]);
    setTimeout(() => lastInputRef.current?.focus(), 50);
  }

  function addBulkRows() {
    const prefix = bulkPrefix.trim() || "Class";
    const newRows: DeploymentRow[] = [];
    for (let i = 1; i <= bulkCount; i++) {
      newRows.push({
        id: "", label: `${prefix} ${i}`, campus: "", deliveryMode: bulkMode, status: "live",
        token: generateToken(), isNew: true, dirty: true, saving: false,
      });
    }
    setRows((prev) => [...prev, ...newRows]);
    setShowBulkAdd(false);
    setBulkPrefix("");
  }

  function updateRow(idx: number, field: keyof DeploymentRow, value: string) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value, dirty: true } : r));
  }

  function removeRow(idx: number) {
    const row = rows[idx];
    if (row.isNew) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  async function saveRow(idx: number) {
    const row = rows[idx];
    if (!row.label.trim() || !versionId) return;

    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, saving: true } : r));

    try {
      if (row.isNew) {
        const depRef = doc(collection(db, "deployments"));
        await setDoc(depRef, {
          surveyId, versionId, token: row.token, label: row.label.trim(),
          campus: row.campus.trim() || null, deliveryMode: row.deliveryMode,
          status: row.status, createdAt: serverTimestamp(),
        });
        setRows((prev) => prev.map((r, i) => i === idx ? { ...r, id: depRef.id, isNew: false, dirty: false, saving: false } : r));
      } else {
        await updateDoc(doc(db, "deployments", row.id), {
          label: row.label.trim(), campus: row.campus.trim() || null,
          deliveryMode: row.deliveryMode, status: row.status,
        });
        setRows((prev) => prev.map((r, i) => i === idx ? { ...r, dirty: false, saving: false } : r));
      }
    } catch (err) {
      console.error("Save error:", err);
      setRows((prev) => prev.map((r, i) => i === idx ? { ...r, saving: false } : r));
    }
  }

  async function saveAll() {
    const dirtyIdxs = rows.map((r, i) => r.dirty ? i : -1).filter((i) => i >= 0);
    for (const idx of dirtyIdxs) {
      await saveRow(idx);
    }
  }

  function copyToken(token: string) {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    live: { bg: dark?"#162e1a":"#dff5e3", color: dark?"#5dbe68":"#1e7a2e", border: dark?"#2a4d2e":"#b8e6c0" },
    paused: { bg: dark?"#332414":"#fff3e0", color: dark?"#f0a050":"#c75300", border: dark?"#4d3820":"#ffd699" },
    closed: { bg: dark?"#222":"#f0f0f0", color: dark?"#606060":"#8a8a8a", border: dark?"#333":"#d4d4d4" },
  };

  if (loading) return <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:textColor(dark,"tertiary"),fontSize:14}}>Loading...</p></div>;

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:dark?"#1a1a1a":"#f5f5f5"}}>
      {/* Header */}
      <header style={{...headerStyle(dark),position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <a href={`/admin/surveys/${surveyId}`} style={{display:"flex",alignItems:"center",gap:6,textDecoration:"none",color:textColor(dark,"secondary"),fontSize:13}}><ArrowLeft size={14}/> Back</a>
            <span style={{color:textColor(dark,"tertiary"),fontSize:13}}>/</span>
            <span style={{fontSize:15,fontWeight:600,color:textColor(dark,"primary")}}>Deployments</span>
            <span style={{fontSize:12,color:textColor(dark,"tertiary")}}>({rows.length})</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {dirtyCount > 0 && (
              <button onClick={saveAll} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                onMouseEnter={(e)=>(e.currentTarget.style.background=accentHoverBg(dark))}
                onMouseLeave={(e)=>(e.currentTarget.style.background=accentBg(dark))}
              ><Save size={14}/> Save All ({dirtyCount})</button>
            )}
            <button onClick={toggle} style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${dark?"#333":"#d4d4d4"}`,background:dark?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.6)",borderRadius:2,cursor:"pointer",color:textColor(dark,"secondary")}}>{dark?<Sun size={15}/>:<Moon size={15}/>}</button>
          </div>
        </div>
      </header>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px 24px"}}>
        {/* Title */}
        <div style={{marginBottom:24}}>
          <h1 style={{fontSize:20,fontWeight:700,color:textColor(dark,"primary"),margin:"0 0 4px"}}>{surveyTitle}</h1>
          <p style={{fontSize:13,color:textColor(dark,"tertiary"),margin:0}}>Create and manage deployments. Click any field to edit inline.</p>
        </div>

        {/* Action bar */}
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          <button onClick={addRow} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}
            onMouseEnter={(e)=>(e.currentTarget.style.background=accentHoverBg(dark))}
            onMouseLeave={(e)=>(e.currentTarget.style.background=accentBg(dark))}
          ><Plus size={14}/> Add One</button>
          <button onClick={()=>setShowBulkAdd(!showBulkAdd)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:"transparent",color:textColor(dark,"secondary"),borderRadius:2,fontSize:13,fontWeight:600,border:`1px solid ${dark?"#333":"#d4d4d4"}`,cursor:"pointer",fontFamily:"inherit"}}>
            <Plus size={14}/> Add Multiple
          </button>
        </div>

        {/* Bulk add panel */}
        {showBulkAdd && (
          <div style={{...glassStyle(dark),padding:20,marginBottom:20,display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Prefix</div>
              <input value={bulkPrefix} onChange={(e)=>setBulkPrefix(e.target.value)} placeholder="e.g. Morning Class"
                style={{padding:"8px 12px",fontSize:13,fontFamily:"inherit",background:dark?"rgba(255,255,255,0.05)":"#fff",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",width:180}}/>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Count</div>
              <input type="number" value={bulkCount} onChange={(e)=>setBulkCount(Math.max(1,Math.min(50,parseInt(e.target.value)||1)))} min={1} max={50}
                style={{padding:"8px 12px",fontSize:13,fontFamily:"inherit",background:dark?"rgba(255,255,255,0.05)":"#fff",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",width:70}}/>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Mode</div>
              <select value={bulkMode} onChange={(e)=>setBulkMode(e.target.value as "form"|"chatbot")}
                style={{padding:"8px 12px",fontSize:13,fontFamily:"inherit",background:dark?"rgba(255,255,255,0.05)":"#fff",border:`1px solid ${dark?"#333":"#d4d4d4"}`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",cursor:"pointer"}}>
                <option value="form">Form</option>
                <option value="chatbot">Chatbot</option>
              </select>
            </div>
            <button onClick={addBulkRows} style={{padding:"8px 16px",background:accentBg(dark),color:"#fff",borderRadius:2,fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              Create {bulkCount}
            </button>
            <div style={{fontSize:12,color:textColor(dark,"tertiary")}}>
              Preview: "{bulkPrefix.trim()||"Class"} 1", "{bulkPrefix.trim()||"Class"} 2", ... "{bulkPrefix.trim()||"Class"} {bulkCount}"
            </div>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div style={{...glassStyle(dark),padding:"48px 24px",textAlign:"center"}}>
            <p style={{fontSize:14,color:textColor(dark,"tertiary")}}>No deployments yet. Add one above.</p>
          </div>
        ) : (
          <div style={{...glassStyle(dark),overflow:"hidden"}}>
            {/* Header row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 140px 80px 70px 200px 80px",gap:0,padding:"10px 16px",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)"}`,background:dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"}}>
              {["Name","Campus","Mode","Status","Link",""].map((h)=>(
                <div key={h} style={{fontSize:10,fontWeight:600,color:textColor(dark,"tertiary"),textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, idx) => {
              const sc = statusColors[row.status] || statusColors.closed;
              return (
                <div key={row.token} style={{display:"grid",gridTemplateColumns:"1fr 140px 80px 70px 200px 80px",gap:0,padding:"8px 16px",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.03)"}`,alignItems:"center",background:row.dirty?(dark?"rgba(77,166,255,0.04)":"rgba(0,120,212,0.03)"):"transparent"}}>
                  {/* Name */}
                  <input
                    ref={idx===rows.length-1?lastInputRef:undefined}
                    value={row.label}
                    onChange={(e)=>updateRow(idx,"label",e.target.value)}
                    onKeyDown={(e)=>{ if(e.key==="Enter") saveRow(idx); if(e.key==="Tab"&&!e.shiftKey&&idx===rows.length-1) { e.preventDefault(); addRow(); }}}
                    placeholder="Deployment name..."
                    style={{padding:"6px 8px",fontSize:13,fontFamily:"inherit",background:"transparent",border:`1px solid transparent`,borderRadius:2,color:textColor(dark,"primary"),outline:"none",width:"100%",transition:"border-color 0.1s"}}
                    onFocus={(e)=>(e.target.style.borderColor=dark?"#333":"#d4d4d4")}
                    onBlur={(e)=>(e.target.style.borderColor="transparent")}
                  />
                  {/* Campus */}
                  <input
                    value={row.campus}
                    onChange={(e)=>updateRow(idx,"campus",e.target.value)}
                    placeholder="Campus..."
                    style={{padding:"6px 8px",fontSize:12,fontFamily:"inherit",background:"transparent",border:`1px solid transparent`,borderRadius:2,color:textColor(dark,"secondary"),outline:"none",width:"100%",transition:"border-color 0.1s"}}
                    onFocus={(e)=>(e.target.style.borderColor=dark?"#333":"#d4d4d4")}
                    onBlur={(e)=>(e.target.style.borderColor="transparent")}
                  />
                  {/* Mode */}
                  <select value={row.deliveryMode} onChange={(e)=>updateRow(idx,"deliveryMode",e.target.value)}
                    style={{padding:"4px 6px",fontSize:11,fontFamily:"inherit",background:"transparent",border:"none",color:textColor(dark,"secondary"),cursor:"pointer",outline:"none"}}>
                    <option value="form">Form</option>
                    <option value="chatbot">Chat</option>
                  </select>
                  {/* Status */}
                  <select value={row.status} onChange={(e)=>updateRow(idx,"status",e.target.value)}
                    style={{padding:"3px 6px",fontSize:10,fontWeight:700,fontFamily:"inherit",background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,borderRadius:2,cursor:"pointer",outline:"none",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="closed">Closed</option>
                  </select>
                  {/* Link */}
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    {!row.isNew ? (
                      <>
                        <span style={{fontSize:11,color:textColor(dark,"tertiary"),fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>/s/{row.token}</span>
                        <button onClick={()=>copyToken(row.token)} title="Copy link" style={{background:"none",border:"none",cursor:"pointer",color:copiedToken===row.token?GREEN_COLOR:textColor(dark,"tertiary"),padding:2,display:"flex"}}>
                          {copiedToken===row.token?<Check size={12}/>:<Copy size={12}/>}
                        </button>
                        <a href={`/s/${row.token}`} target="_blank" rel="noopener noreferrer" style={{color:textColor(dark,"tertiary"),display:"flex",padding:2}}><ExternalLink size={12}/></a>
                      </>
                    ) : (
                      <span style={{fontSize:11,color:textColor(dark,"tertiary"),fontStyle:"italic"}}>Save to get link</span>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                    {row.dirty && (
                      <button onClick={()=>saveRow(idx)} disabled={row.saving||!row.label.trim()} title="Save"
                        style={{padding:"4px 10px",fontSize:11,fontWeight:600,fontFamily:"inherit",background:row.label.trim()?accentBg(dark):(dark?"#333":"#ddd"),color:row.label.trim()?"#fff":textColor(dark,"tertiary"),border:"none",borderRadius:2,cursor:row.label.trim()?"pointer":"default",display:"flex",alignItems:"center",gap:4}}>
                        {row.saving?<Loader2 size={11} style={{animation:"spin 0.8s linear infinite"}}/>:<Save size={11}/>}
                        {row.saving?"...":"Save"}
                      </button>
                    )}
                    {row.isNew && (
                      <button onClick={()=>removeRow(idx)} title="Remove" style={{padding:4,background:"none",border:"none",cursor:"pointer",color:textColor(dark,"tertiary"),display:"flex"}}><Trash2 size={13}/></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Keyboard hint */}
        <div style={{marginTop:12,fontSize:11,color:textColor(dark,"tertiary")}}>
          <kbd style={{padding:"1px 5px",background:dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)",borderRadius:2,fontSize:10,border:`1px solid ${dark?"#333":"#d4d4d4"}`}}>Enter</kbd> to save row · <kbd style={{padding:"1px 5px",background:dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)",borderRadius:2,fontSize:10,border:`1px solid ${dark?"#333":"#d4d4d4"}`}}>Tab</kbd> on last row to add new
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const GREEN_COLOR = "#1e7a2e";