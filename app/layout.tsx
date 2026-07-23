import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "4WARD — One crew. One direction.",
  description:
    "4WARD is the crew's shared development tracker — 70 stats, 7 categories, one direction: forward.",
  applicationName: "4WARD",
  manifest: "/manifest.webmanifest",
  // Standalone shell on iOS home-screen installs (no Safari chrome), and the
  // prerequisite for Web Push on iOS 16.4+.
  appleWebApp: {
    capable: true,
    title: "4WARD",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    // Next emits the standardised `mobile-web-app-capable`; older iOS builds
    // still look for the Apple-prefixed legacy tag before going standalone.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to be non-zero on iOS home-screen
  // installs — without it the tab bar sits flush against the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
