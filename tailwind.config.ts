import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        af: {
          bg: "#0B0E14",
          surface: "#121722",
          elevated: "#1A2233",
          border: "#263147",
          text: "#F3F6FC",
          muted: "#94A3B8",
          accent: "#38BDF8",
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;

