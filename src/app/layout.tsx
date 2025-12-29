import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulated Live Stream",
  description: "Watch our live broadcast",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
