// src/app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProvider from "../components/AuthProvider";
import Web3ModalProvider from "../components/Web3ModalProvider";
import Cascara from "../components/Cascara";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cultomizer - Primal Cult",
  description:
    "Connect your wallet, select and customize your Primal Cult NFTs here",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* El fondo vive aca y no en cada pantalla: con el header arriba, un
          min-h-screen por pantalla dejaba scroll de mas. */}
      <body
        className={`${inter.className} min-h-screen bg-gradient-to-l from-[#000000] to-[#090746] text-white`}
      >
        <AuthProvider>
          <Web3ModalProvider>
            <Cascara>{children}</Cascara>
          </Web3ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
