import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "USTAAD — Learn a procedure once. Verify it every time.",
  description:
    "USTAAD learns a physical procedure from one expert video and a short manual, then an agent watches a worker and verifies each step with OpenCV 5. PASS advances, FAIL flags the region, UNSURE escalates to a human.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans antialiased bg-paper text-ink">{children}</body>
    </html>
  );
}
