// app/layout.tsx
// Root layout: fonts + theme foundation. Server component.

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Telemetry numbers, durations, UUIDs and phone numbers render in mono —
// tabular figures keep columns steady while data streams in.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Callwise — AI Receptionist Analytics",
  description: "Call telemetry, transcripts and AI quality analysis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      {/* Dark is the default operating mode; the sidebar toggle swaps the class. */}
      <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
        <body className="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-zinc-900 dark:text-zinc-100">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

/* ------------------------------------------------------------------
   app/globals.css  (create alongside this file)

   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   :root { color-scheme: light; }
   .dark { color-scheme: dark; }

   ::selection { background: rgb(99 102 241 / 0.25); }

   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }

   tailwind.config.ts additions:
   theme.extend.fontFamily = {
     sans: ["var(--font-sans)", "system-ui", "sans-serif"],
     mono: ["var(--font-mono)", "monospace"],
   }
   darkMode: "class"
------------------------------------------------------------------- */
