import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  applicationName: "Planly",
  title: "Planly — Your DSA journey, in focus",
  description: "A calmer, clearer way to prepare for coding interviews.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    title: "Planly — Your DSA journey, in focus",
    description: "A focused workspace for your data structures and algorithms preparation.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
