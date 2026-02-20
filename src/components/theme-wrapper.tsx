"use client";

import { useTheme } from "./theme-provider";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  const lightGradient =
    "radial-gradient(ellipse at 15% 60%, rgba(0,120,212,0.10) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 75% 15%, rgba(0,120,212,0.07) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 90%, rgba(100,180,255,0.05) 0%, transparent 40%)";

  const darkGradient =
    "radial-gradient(ellipse at 15% 60%, rgba(77,166,255,0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 75% 15%, rgba(77,166,255,0.05) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 90%, rgba(40,100,200,0.04) 0%, transparent 40%)";

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        background: theme === "dark" ? "#141414" : "#eaeef2",
        backgroundImage: theme === "dark" ? darkGradient : lightGradient,
        backgroundAttachment: "fixed",
        color: theme === "dark" ? "#eaeaea" : "#1a1a1a",
      }}
    >
      {children}
    </div>
  );
}