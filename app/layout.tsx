import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { SessionProvider } from "@/components/session-provider";
import { AppShell } from "@/components/shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/components/theme/theme";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Markwise — see what the class got wrong",
  description:
    "Mark a batch of student answers once, and find out which misconceptions are actually spreading through the class.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e5e4eb" },
    { media: "(prefers-color-scheme: dark)", color: "#14121F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={inter.variable + " " + manrope.variable + " antialiased"}>
        <ThemeProvider>
          <AuthProvider>
            <SessionProvider>
              <AppShell>{children}</AppShell>
            </SessionProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
