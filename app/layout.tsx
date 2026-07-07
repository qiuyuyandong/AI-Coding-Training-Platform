import "./globals.css";
import type { ReactNode } from "react";

const links = [
  ["Problems", "/problems"],
  ["Training", "/training"],
  ["Coach", "/coach"],
  ["Growth", "/growth"],
  ["Sources", "/sources"],
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl gap-4 px-6 py-3 text-sm text-slate-600">
            {links.map(([label, href]) => (
              <a key={href} className="hover:text-slate-950" href={href}>{label}</a>
            ))}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
