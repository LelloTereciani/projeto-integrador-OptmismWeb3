import "./globals.css";

import { Web3Providers } from "../components/wallet-panel";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><Web3Providers>{children}</Web3Providers></body>
    </html>
  );
}
