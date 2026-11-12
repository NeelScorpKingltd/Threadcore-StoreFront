import React from "react";
import { Navbar } from "@/components/Navbar";

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6]">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200/80 bg-white/50 py-8 text-center text-xs text-stone-500">
        <div className="mx-auto max-w-7xl px-4">
          ThreadCore © {new Date().getFullYear()} — Editorial Minimalism
        </div>
      </footer>
    </div>
  );
}
