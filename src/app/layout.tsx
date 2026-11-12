import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AegisFlow Rental | Equipment Deposit & Fleet Cockpit",
  description:
    "AI-assisted equipment rental deposit, inspection, pricing proof, and dispute protection powered by PayPal Braintree Sandbox and Amazon Nova.",
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

