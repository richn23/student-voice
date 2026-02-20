"use client";

import { useTheme } from "./theme-provider";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const stroke = dark ? "%23ffffff" : "%234a6d8c";
  const opacity = dark ? "0.04" : "0.12";
  const opacityMid = dark ? "0.03" : "0.08";
  const opacityFar = dark ? "0.02" : "0.05";

  // Topographic contour map — 3 clusters at different opacities for depth
  const topoPattern = `url("data:image/svg+xml,%3Csvg width='1400' height='1100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke-linecap='round'%3E%3C!-- Foreground cluster: top-right --%3E%3Cg stroke='${stroke}' opacity='${opacity}' stroke-width='0.8'%3E%3Cellipse cx='950' cy='200' rx='320' ry='180' transform='rotate(-12 950 200)'/%3E%3Cellipse cx='950' cy='200' rx='260' ry='145' transform='rotate(-12 950 200)'/%3E%3Cellipse cx='950' cy='200' rx='200' ry='110' transform='rotate(-12 950 200)'/%3E%3Cellipse cx='950' cy='200' rx='140' ry='75' transform='rotate(-12 950 200)'/%3E%3Cellipse cx='950' cy='200' rx='80' ry='40' transform='rotate(-12 950 200)'/%3E%3Cellipse cx='950' cy='200' rx='30' ry='14' transform='rotate(-12 950 200)'/%3E%3C/g%3E%3C!-- Mid cluster: center-left --%3E%3Cg stroke='${stroke}' opacity='${opacityMid}' stroke-width='0.6'%3E%3Cellipse cx='250' cy='450' rx='280' ry='200' transform='rotate(8 250 450)'/%3E%3Cellipse cx='250' cy='450' rx='220' ry='155' transform='rotate(8 250 450)'/%3E%3Cellipse cx='250' cy='450' rx='165' ry='110' transform='rotate(8 250 450)'/%3E%3Cellipse cx='250' cy='450' rx='110' ry='70' transform='rotate(8 250 450)'/%3E%3Cellipse cx='250' cy='450' rx='55' ry='32' transform='rotate(8 250 450)'/%3E%3C/g%3E%3C!-- Far cluster: bottom-right --%3E%3Cg stroke='${stroke}' opacity='${opacityFar}' stroke-width='0.5'%3E%3Cellipse cx='1050' cy='800' rx='350' ry='220' transform='rotate(-5 1050 800)'/%3E%3Cellipse cx='1050' cy='800' rx='280' ry='170' transform='rotate(-5 1050 800)'/%3E%3Cellipse cx='1050' cy='800' rx='210' ry='125' transform='rotate(-5 1050 800)'/%3E%3Cellipse cx='1050' cy='800' rx='140' ry='80' transform='rotate(-5 1050 800)'/%3E%3Cellipse cx='1050' cy='800' rx='70' ry='38' transform='rotate(-5 1050 800)'/%3E%3C/g%3E%3C!-- Subtle far cluster: top-left --%3E%3Cg stroke='${stroke}' opacity='${opacityFar}' stroke-width='0.4'%3E%3Cellipse cx='150' cy='100' rx='200' ry='120' transform='rotate(15 150 100)'/%3E%3Cellipse cx='150' cy='100' rx='140' ry='80' transform='rotate(15 150 100)'/%3E%3Cellipse cx='150' cy='100' rx='80' ry='42' transform='rotate(15 150 100)'/%3E%3C/g%3E%3C!-- Mid-ground: bottom-left --%3E%3Cg stroke='${stroke}' opacity='${opacityMid}' stroke-width='0.5'%3E%3Cellipse cx='400' cy='900' rx='240' ry='150' transform='rotate(-10 400 900)'/%3E%3Cellipse cx='400' cy='900' rx='175' ry='105' transform='rotate(-10 400 900)'/%3E%3Cellipse cx='400' cy='900' rx='110' ry='62' transform='rotate(-10 400 900)'/%3E%3Cellipse cx='400' cy='900' rx='50' ry='26' transform='rotate(-10 400 900)'/%3E%3C/g%3E%3C!-- Small accent: center-right --%3E%3Cg stroke='${stroke}' opacity='${opacity}' stroke-width='0.7'%3E%3Cellipse cx='750' cy='550' rx='130' ry='90' transform='rotate(20 750 550)'/%3E%3Cellipse cx='750' cy='550' rx='80' ry='52' transform='rotate(20 750 550)'/%3E%3Cellipse cx='750' cy='550' rx='35' ry='18' transform='rotate(20 750 550)'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

  const lightGradient =
    "radial-gradient(ellipse at 70% 15%, rgba(0,120,212,0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 18% 45%, rgba(0,90,180,0.06) 0%, transparent 45%), " +
    "radial-gradient(ellipse at 80% 75%, rgba(60,140,220,0.04) 0%, transparent 40%)";

  const darkGradient =
    "radial-gradient(ellipse at 70% 15%, rgba(77,166,255,0.06) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 18% 45%, rgba(77,166,255,0.04) 0%, transparent 45%), " +
    "radial-gradient(ellipse at 80% 75%, rgba(40,100,200,0.03) 0%, transparent 40%)";

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        background: dark ? "#141414" : "#ebeef2",
        backgroundImage: `${dark ? darkGradient : lightGradient}, ${topoPattern}`,
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