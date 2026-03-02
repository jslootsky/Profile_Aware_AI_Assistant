import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile-Aware AI Assistant",
  description: "Personalized recommendation and report assistant"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
