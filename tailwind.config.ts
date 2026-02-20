import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
      },
      colors: {
        accent: {
          DEFAULT: "#0078d4",
          hover: "#106ebe",
          subtle: "#e8f1fb",
          text: "#0078d4",
          dark: "#4da6ff",
          "dark-hover": "#3d96ef",
          "dark-subtle": "#1a3a5c",
        },
        surface: {
          base: "#f5f5f5",
          card: "rgba(255, 255, 255, 0.6)",
          "card-hover": "rgba(255, 255, 255, 0.75)",
          elevated: "#ffffff",
          subtle: "#f0f0f0",
          "dark-base": "#1a1a1a",
          "dark-card": "rgba(255, 255, 255, 0.06)",
          "dark-card-hover": "rgba(255, 255, 255, 0.1)",
          "dark-elevated": "#383838",
          "dark-subtle": "#252525",
        },
      },
    },
  },
  plugins: [],
};

export default config;
