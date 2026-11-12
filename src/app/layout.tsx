import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ThreadCore — Editorial Apparel Storefront",
  description:
    "Curated essentials and modular apparel engineered with zero-compromise precision.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen bg-[#FAF9F6] text-stone-900 flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
