import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  applicationName: brand.name,
  title: brand.title,
  description: brand.description,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    title: brand.title,
    description: brand.description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
