import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Wedding Planner",
  description: "Constraint-aware wedding planning focused on affordability"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
