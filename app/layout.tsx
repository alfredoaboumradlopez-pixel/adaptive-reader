import type { Metadata, Viewport } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Adaptive Reader",
  description: "Lee, anota y lleva cada libro a tu vida.",
  applicationName: "TAR",
  appleWebApp: {
    capable: true,
    title: "TAR",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5f1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} ${literata.variable}`}>
      <body>{children}</body>
    </html>
  );
}
