import "./globals.css";
import type { ReactNode } from "react";

const links = [
  ["Map", "/map"],
  ["Resources", "/resources"],
  ["Plan", "/plan"],
  ["Today", "/today"],
  ["Problems", "/problems"],
  ["Training", "/training"],
  ["Evidence", "/evidence"],
  ["Projects", "/projects"],
  ["Coach", "/coach"],
  ["Growth", "/growth"],
  ["Sources", "/sources"],
  ["Compliance", "/compliance"],
  ["Settings", "/settings"],
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
