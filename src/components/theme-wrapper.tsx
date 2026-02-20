"use client";

import { useTheme } from "./theme-provider";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const lightGradient =
    "radial-gradient(ellipse at 15% 60%, rgba(0,120,212,0.10) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 75% 15%, rgba(0,120,212,0.07) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 90%, rgba(100,180,255,0.05) 0%, transparent 40%)";

  const darkGradient =
    "radial-gradient(ellipse at 15% 60%, rgba(77,166,255,0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 75% 15%, rgba(77,166,255,0.05) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 90%, rgba(40,100,200,0.04) 0%, transparent 40%)";

  // Subtle zen sand garden SVG — soft raked curves
  const zenPattern = `url("data:image/svg+xml,%3Csvg width='800' height='600' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='0.5'/%3E%3C/filter%3E%3C/defs%3E%3Cg filter='url(%23g)' fill='none' stroke='${dark ? "%23ffffff" : "%23000000"}' opacity='${dark ? "0.025" : "0.035"}' stroke-width='0.8'%3E%3Cpath d='M0,80 Q200,60 400,85 T800,75'/%3E%3Cpath d='M0,120 Q250,95 450,125 T800,110'/%3E%3Cpath d='M0,165 Q180,145 380,170 T800,155'/%3E%3Cpath d='M0,210 Q220,188 420,215 T800,200'/%3E%3Cpath d='M0,260 Q200,240 400,265 T800,250'/%3E%3Cpath d='M0,310 Q240,285 440,315 T800,300'/%3E%3Cpath d='M0,360 Q190,340 390,365 T800,350'/%3E%3Cpath d='M0,410 Q230,388 430,415 T800,400'/%3E%3Cpath d='M0,460 Q210,440 410,465 T800,450'/%3E%3Cpath d='M0,510 Q250,488 450,515 T800,500'/%3E%3Cpath d='M0,560 Q200,540 400,565 T800,550'/%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        background: dark ? "#141414" : "#eaeef2",
        backgroundImage: `${dark ? darkGradient : lightGradient}, ${zenPattern}`,
        backgroundAttachment: "fixed",
        backgroundSize: "100% 100%, 800px 600px",
        color: dark ? "#eaeaea" : "#1a1a1a",
      }}
    >
      {children}
    </div>
  );
}