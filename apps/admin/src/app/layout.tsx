import './globals.css'
import { DM_Sans, DM_Mono } from 'next/font/google'
import { cn } from '@/lib/utils'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  // Variable font — no explicit weight list needed
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn('dark', dmSans.variable, dmMono.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
