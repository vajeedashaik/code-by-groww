import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Market Watchlist",
  description: "Phase 1 foundation — auth and database schema.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-white text-gray-900 antialiased">
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
