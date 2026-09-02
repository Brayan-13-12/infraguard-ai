import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/toast";
import { LanguageProvider } from "@/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "InfraGuard AI",
    template: "%s · InfraGuard AI",
  },
  description:
    "Infrastructure intelligence and incident management for modern technology teams.",
  applicationName: "InfraGuard AI",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#080b12" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>{children}</AuthProvider>
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
