import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FreightBite - AI-Powered Freight Relay Platform',
  description: 'AI dispatcher breaks loads into HOS-legal relay legs, matches drivers, and connects your network.',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    apple: '/logo.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#f5f0ea',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="font-sans antialiased min-h-screen min-h-[100dvh] bg-background text-foreground overflow-x-hidden w-full">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
