import type { Metadata } from "next";
import "./globals.css";
import { LegalFooter } from "@/components/layout/legal-banner";

export const metadata: Metadata = {
  title: "DealMX — Oportunidades de inversión inmobiliaria en México",
  description: "Marketplace de oportunidades inmobiliarias en México.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <header className="border-b border-border px-4 py-3">
          <nav className="mx-auto flex max-w-6xl items-center justify-between">
            <a href="/" className="text-lg font-bold text-primary">DealMX</a>
            <div className="flex gap-4 text-sm">
              <a href="/buscar">Buscar</a><a href="/publicar">Publicar</a><a href="/auth/login">Entrar</a>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <LegalFooter />
      </body>
    </html>
  );
}
