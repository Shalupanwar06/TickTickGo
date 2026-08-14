import "./globals.css";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata = {
  title: "TickTickGo",
  description: "Support tickets in. Ranked problems, a verified fix, and sign-off out.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body>
        <div className="wrap">
          <nav className="topnav">
            <a className="wordmark" href="/ui/">
              <span className="tick" aria-hidden="true" />
              TickTickGo
            </a>
            <div className="navlinks">
              <a href="/ui/">Board</a>
              <a href="/storefront.html">Sample app ↗</a>
              <span className="badge badge-synthetic">Synthetic data</span>
            </div>
          </nav>
          {children}
          <footer className="appfoot">
            <span>Read-only triage · drafts never send · fixes patch the sample app only</span>
            <span className="mono">SF Enterprise Hackathon · 14 Aug 2026</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
