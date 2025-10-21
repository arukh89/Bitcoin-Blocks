'use client';

import { useEffect } from 'react';

export default function FarcasterMetaOverride(): null {
  useEffect(() => {
    // Override Farcaster frame metadata on client-side to change button title
    const farcasterConfig = {
      version: "next",
      imageUrl: "https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/thumbnail_cmgifd2dg000204jp98x53ays-p9n6Mjcrk6gppFNpz3AczxHR2Yz5kR",
      button: {
        title: "Launch Bitcoin Blocks",
        action: {
          type: "launch_frame",
          name: "Bitcoin Blocks",
          url: "https://gas-aside-395.app.ohara.ai",
          splashImageUrl: "https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/farcaster/splash_images/splash_image1.svg",
          splashBackgroundColor: "#ffffff"
        }
      }
    };

    // Find existing fc:frame meta tag
    let metaTag = document.querySelector('meta[property="fc:frame"]') as HTMLMetaElement;
    
    if (metaTag) {
      // Update existing tag
      metaTag.setAttribute('content', JSON.stringify(farcasterConfig));
    } else {
      // Create new tag if doesn't exist
      metaTag = document.createElement('meta');
      metaTag.setAttribute('property', 'fc:frame');
      metaTag.setAttribute('content', JSON.stringify(farcasterConfig));
      document.head.appendChild(metaTag);
    }
  }, []);

  return null;
}
