import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "تدارك — متابعة أثر التصحيح",
  description: "مساحة لمراجعة أثر تصحيح المعلومة في النصوص المرتبطة بها.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
