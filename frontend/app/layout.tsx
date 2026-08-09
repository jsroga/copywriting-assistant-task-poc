import type { Metadata } from 'next'

import './globals.css'
import { UI_TEXT } from '@/constants'
import { roboto } from '@/lib/fonts-wire'

export const metadata: Metadata = {
  title: UI_TEXT.APP_TITLE,
  description: UI_TEXT.APP_SUBTITLE,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} antialiased`}>{children}</body>
    </html>
  )
}
