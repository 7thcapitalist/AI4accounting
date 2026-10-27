import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "AI4accounting · Fechamento do mês",
  description: "Agentes de IA fechando o mês fiscal dos clientes do escritório.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
