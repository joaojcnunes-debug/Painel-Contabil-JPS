import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/lib/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "JSP Contabilidade Personalizada",
    template: "%s • JSP",
  },
  description:
    "Sistema da JSP Contabilidade Personalizada: clientes, obrigações, documentos e honorários.",
  applicationName: "JSP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JSP",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: import("next").Viewport = {
  themeColor: "#4A5326",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
