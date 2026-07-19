import type { Metadata } from 'next';
import './globals.css';
import { DM_Serif_Display, Outfit, JetBrains_Mono } from 'next/font/google';


const serif = DM_Serif_Display({ subsets: ['latin'], weight: ['400'], style: ['normal','italic'], variable: '--font-serif' });
const sans  = Outfit({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-sans' });
const mono  = JetBrains_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'ProofFolio | Privacy-Preserving Credential Verification',
  description: 'Verify qualifications, not personal data. Built for Midnight with zero-knowledge proofs.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full antialiased ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
