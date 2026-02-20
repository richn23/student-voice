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

  // Subtle zen sand garden SVG — flowing concentric raked curves spread across full canvas
  const zenPattern = `url("data:image/svg+xml,%3Csvg width='1600' height='1200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='0.3'/%3E%3C/filter%3E%3C/defs%3E%3Cg filter='url(%23g)' fill='none' stroke='${dark ? "%23ffffff" : "%23000000"}' opacity='${dark ? "0.045" : "0.06"}' stroke-width='0.9'%3E%3Cpath d='M-50,80 Q200,40 400,90 Q600,140 800,80 Q1000,20 1200,70 Q1400,120 1650,60'/%3E%3Cpath d='M-50,120 Q200,80 400,130 Q600,180 800,120 Q1000,60 1200,110 Q1400,160 1650,100'/%3E%3Cpath d='M-50,160 Q200,120 400,170 Q600,220 800,160 Q1000,100 1200,150 Q1400,200 1650,140'/%3E%3Cpath d='M-50,200 Q200,160 400,210 Q600,260 800,200 Q1000,140 1200,190 Q1400,240 1650,180'/%3E%3Cpath d='M-50,320 Q250,280 500,340 Q700,380 900,310 Q1100,250 1300,300 Q1500,350 1650,290'/%3E%3Cpath d='M-50,360 Q250,320 500,380 Q700,420 900,350 Q1100,290 1300,340 Q1500,390 1650,330'/%3E%3Cpath d='M-50,400 Q250,360 500,420 Q700,460 900,390 Q1100,330 1300,380 Q1500,430 1650,370'/%3E%3Cpath d='M-50,530 Q300,490 550,550 Q750,590 950,520 Q1150,460 1350,510 Q1550,560 1650,500'/%3E%3Cpath d='M-50,570 Q300,530 550,590 Q750,630 950,560 Q1150,500 1350,550 Q1550,600 1650,540'/%3E%3Cpath d='M-50,610 Q300,570 550,630 Q750,670 950,600 Q1150,540 1350,590 Q1550,640 1650,580'/%3E%3Cpath d='M-50,740 Q200,710 450,760 Q650,800 850,730 Q1050,670 1250,720 Q1450,770 1650,710'/%3E%3Cpath d='M-50,780 Q200,750 450,800 Q650,840 850,770 Q1050,710 1250,760 Q1450,810 1650,750'/%3E%3Cpath d='M-50,820 Q200,790 450,840 Q650,880 850,810 Q1050,750 1250,800 Q1450,850 1650,790'/%3E%3Cpath d='M-50,940 Q250,910 500,960 Q700,1000 900,930 Q1100,870 1300,920 Q1500,970 1650,910'/%3E%3Cpath d='M-50,980 Q250,950 500,1000 Q700,1040 900,970 Q1100,910 1300,960 Q1500,1010 1650,950'/%3E%3Cpath d='M-50,1020 Q250,990 500,1040 Q700,1080 900,1010 Q1100,950 1300,1000 Q1500,1050 1650,990'/%3E%3Cpath d='M-50,1120 Q200,1090 400,1140 Q600,1180 800,1110 Q1000,1050 1200,1100 Q1400,1150 1650,1090'/%3E%3Cpath d='M-50,1160 Q200,1130 400,1180 Q600,1220 800,1150 Q1000,1090 1200,1140 Q1400,1190 1650,1130'/%3E%3C/g%3E%3C/svg%3E")`;

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        background: dark ? "#141414" : "#eaeef2",
        backgroundImage: `${dark ? darkGradient : lightGradient}, ${zenPattern}`,
        backgroundAttachment: "fixed",
        backgroundSize: "100% 100%, cover",
        backgroundRepeat: "no-repeat, no-repeat",
        color: dark ? "#eaeaea" : "#1a1a1a",
      }}
    >
      {children}
    </div>
  );
}