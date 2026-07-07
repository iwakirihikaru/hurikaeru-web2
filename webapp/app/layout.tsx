import type { Metadata } from "next";
import "./globals.css";
import { AppStateProvider } from "@/lib/app-state";

export const metadata: Metadata = {
  title: "ふりかえり Web",
  description: "GAS版の現場導線を引き継ぐ配布向け Web/PWA 版"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
