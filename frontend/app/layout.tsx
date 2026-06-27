import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n";
import Header from "@/components/Header";
import Disclaimer from "@/components/Disclaimer";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeartLens",
  description:
    "Understand your medical report and get a heart-disease risk screening estimate. " +
    "A screening tool, not a diagnosis.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow zoom — never trap low-vision users (accessibility, CLAUDE.md §1).
  maximumScale: 5,
  themeColor: "#0e7c86",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // <html lang> defaults to Bangla (the primary audience) and is kept in sync by I18nProvider.
  // suppressHydrationWarning: browser extensions (QuillBot, grammar/translate add-ons, etc.)
  // inject attributes like data-qb-installed / webcrx onto <html> before React hydrates. Those
  // attributes only exist on the client, so React reports a hydration mismatch on this element.
  // This flag silences that one-level warning; it does NOT mask real mismatches in the tree.
  return (
    <html lang="bn" suppressHydrationWarning>
      <body>
        <I18nProvider>
          <div className="app-shell">
            <Header />
            <main className="main">{children}</main>
            <footer className="container" style={{ paddingBottom: "var(--sp-6)" }}>
              <Disclaimer />
            </footer>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
