import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";

import SiteShell from "@/components/SiteShell";
import { ElementalEnd, FZY } from "@/fonts";

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500"],
  subsets: ["latin"]
})

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Driven Sri Lanka",
  description: "AI Driven Sri Lanka",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ElementalEnd.variable} ${FZY.variable} ${poppins.variable} relative antialiased`}
        suppressHydrationWarning
      >
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
