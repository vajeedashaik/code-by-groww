import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/header";
import Backdrop from "@/components/ui/backdrop";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Groww Pulse",
  description:
    "Groww Pulse remembers exactly what you last saw and only surfaces a stock again when the move is genuinely meaningful — not another noisy ticker dashboard.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
        <body className="min-h-screen bg-ink font-sans text-white antialiased">
          <Backdrop />
          <Header />
          <main className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
