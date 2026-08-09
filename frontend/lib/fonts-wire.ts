import { Roboto } from 'next/font/google'

/** next/font requires literal option values in this file (not imported consts). */
export const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto',
})
