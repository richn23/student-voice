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

  // Subtle zen sand garden SVG — flowing concentric raked curves
  const zenPattern = `url("data:image/svg+xml,%3Csvg width='1200' height='900' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='0.4'/%3E%3C/filter%3E%3C/defs%3E%3Cg filter='url(%23g)' fill='none' stroke='${dark ? "%23ffffff" : "%23000000"}' opacity='${dark ? "0.045" : "0.065"}' stroke-width='1'%3E%3C!-- Top-right flowing curves --%3E%3Cpath d='M900,0 Q750,120 850,300 T780,500'/%3E%3Cpath d='M940,0 Q790,130 890,310 T820,510'/%3E%3Cpath d='M980,0 Q830,140 930,320 T860,520'/%3E%3Cpath d='M1020,0 Q870,150 970,330 T900,530'/%3E%3Cpath d='M1060,0 Q910,160 1010,340 T940,540'/%3E%3Cpath d='M1100,0 Q950,170 1050,350 T980,550'/%3E%3Cpath d='M1140,0 Q990,180 1090,360 T1020,560'/%3E%3C!-- Bottom-left flowing curves --%3E%3Cpath d='M0,500 Q150,420 100,600 T200,800'/%3E%3Cpath d='M0,540 Q160,460 110,640 T210,840'/%3E%3Cpath d='M0,580 Q170,500 120,680 T220,880'/%3E%3Cpath d='M0,620 Q180,540 130,720 T230,920'/%3E%3Cpath d='M0,660 Q190,580 140,760 T240,960'/%3E%3C!-- Center gentle arcs --%3E%3Cpath d='M300,200 Q500,180 600,280 T750,350'/%3E%3Cpath d='M280,240 Q480,220 580,320 T730,390'/%3E%3Cpath d='M260,280 Q460,260 560,360 T710,430'/%3E%3C/g%3E%3C/svg%3E")`;

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