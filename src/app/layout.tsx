import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { GameProvider } from '@/context/GameContext'
import FarcasterWrapper from "@/components/FarcasterWrapper";
import FarcasterMetaOverride from "@/components/FarcasterMetaOverride";

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Farcaster frame configuration - USING THIS FOR RUNTIME OVERRIDE
const farcasterFrameConfig = {
  version: "next",
  imageUrl: "https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/thumbnail_cmgifd2dg000204jp98x53ays-p9n6Mjcrk6gppFNpz3AczxHR2Yz5kR",
  button: {
    title: "Launch Bitcoin Blocks",
    action: {
      type: "launch_frame",
      name: "Bitcoin Blocks",
      url: "https://bitcoin-blocks.vercel.app/",
      splashImageUrl: "https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/farcaster/splash_images/splash_image1.svg",
      splashBackgroundColor: "#ffffff"
    }
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta property="fc:frame" content={JSON.stringify(farcasterFrameConfig)} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FarcasterMetaOverride />
        <GameProvider>
          <FarcasterWrapper>
            {children}
          </FarcasterWrapper>
        </GameProvider>
      </body>
    </html>
  );
}

export const metadata: Metadata = {
  title: "Bitcoin Blocks",
  description: "Predict Bitcoin transactions & compete! Login, guess, and win by forecasting the next block's transaction count. Real-time updates and leaderboard powered by Supabase. Join the battle!",
  other: {
    "fc:frame": JSON.stringify({
      "version":"next",
      "imageUrl":"https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/thumbnail_cmgifd2dg000204jp98x53ays-p9n6Mjcrk6gppFNpz3AczxHR2Yz5kR",
      "button":{
        "title":"Launch Bitcoin Blocks",
        "action":{
          "type":"launch_frame",
          "name":"Bitcoin Blocks",
          "url":"https://bitcoin-blocks.vercel.app/",
          "splashImageUrl":"https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/farcaster/splash_images/splash_image1.svg",
          "splashBackgroundColor":"#ffffff"
        }
      }
    })
  }
};
