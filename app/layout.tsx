import type { Metadata } from "next";
import "./globals.css";
import { CoreSessionProvider } from "@/components/core-shell";

export const metadata: Metadata = {
  title: "Coreto — Gestão Interna",
  description: "Sistema interno de operação e gestão da Coreto.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="antialiased"><CoreSessionProvider>{children}</CoreSessionProvider></body></html>;
}
