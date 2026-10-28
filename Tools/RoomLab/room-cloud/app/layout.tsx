import type { Metadata } from "next";
import "./globals.css";
import "./library.css";

export const metadata: Metadata = {
  title: "Room Lab · 云端版本库",
  description: "Room Lab 云端版本节点图、关卡和素材管理。",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
