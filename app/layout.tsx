import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fonte-carregada", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Coreto", template: "%s · Coreto" },
  description: "Sistema de gestão da Coreto",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#eef2f0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
