import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Thesis",
  description:
    "Discover investments across US and Japanese markets. Know why you invested—and when the facts change.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
