import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeWrapper } from "@/components/theme-wrapper";

export const metadata: Metadata = {
  title: "Student Voice",
  description: "Anonymous student feedback system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ThemeWrapper>{children}</ThemeWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}