"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { SurveyRunner } from "./survey-runner";
import { ChatbotRunner } from "./chatbot-runner";

interface PageProps {
  params: { token: string };
}

export default function SurveyPage({ params }: PageProps) {
  const [mode, setMode] = useState<"loading" | "form" | "chatbot" | "error">("loading");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    checkDeploymentMode();
    setTimeout(() => setMounted(true), 50);
  }, [params.token]);

  async function checkDeploymentMode() {
    try {
      const depSnap = await getDocs(
        query(collection(db, "deployments"), where("token", "==", params.token), where("status", "==", "live"))
      );

      if (depSnap.empty) {
        // Let the runner handle the error display
        setMode("form");
        return;
      }

      const dep = depSnap.docs[0].data();
      setMode(dep.deliveryMode === "chatbot" ? "chatbot" : "form");
    } catch {
      setMode("form"); // fallback to form on error
    }
  }

  if (mode === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#EDEEF2", fontFamily: "'DM Sans', system-ui, sans-serif",
        opacity: mounted ? 1 : 0, transition: "opacity 0.3s",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "3px solid #E8723A22", borderTopColor: "#E8723A",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (mode === "chatbot") {
    return <ChatbotRunner token={params.token} />;
  }

  return <SurveyRunner token={params.token} />;
}