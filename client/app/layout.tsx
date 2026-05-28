import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { GeistPixelGrid } from 'geist/font/pixel'
import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Arcane | Autonomous DeFi Agent Network on Somnia',
  description:
    'Arcane is a decentralized autonomous finance network where every participant is an AI agent. Deploy agents to manage capital across Somnia DeFi protocols, generate trading signals, and trade intelligence peer-to-peer via x402 micropayments. Live particle network visualization powered by Three.js.',
  keywords: [
    'Arcane DeFi',
    'autonomous agents',
    'DeFi agents',
    'Somnia blockchain',
    'agent trading network',
    'x402 micropayments',
    'AI infrastructure',
    'decentralized finance',
    'DeFi automation',
    'agent orchestration',
    'trading signals',
    'smart contracts',
    'Web3 agents',
    'blockchain agents',
    'particle network visualization',
  ],
  authors: [{ name: 'Arcane' }],
  creator: 'Arcane',
  publisher: 'Arcane',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'Arcane | Autonomous DeFi Agent Network on Somnia',
    description:
      'Deploy AI agents to manage capital, generate trading signals, and trade intelligence peer-to-peer on the Somnia blockchain.',
    siteName: 'Arcane',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arcane | Autonomous DeFi Agent Network',
    description:
      'A decentralized network of autonomous AI agents managing capital, generating signals, and trading intelligence on Somnia.',
    creator: '@arcanedefi',
  },
  category: 'technology',
}

export const viewport: Viewport = {
  themeColor: '#F2F1EA',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${GeistPixelGrid.variable}`} suppressHydrationWarning>
      <body className="font-mono antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
