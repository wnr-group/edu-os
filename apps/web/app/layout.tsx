import type { Metadata } from "next";
import "./globals.css";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://eduos.com"),
  title: {
    default: "EduOS — Empowering Schools with Intelligent Management",
    template: "%s | EduOS",
  },
  description:
     "EduOS gives your school a unified platform for administration, academics, and communication — attendance, grading, fee tracking, and parent engagement in one place.",
  keywords: [
    "school ERP",
    "school management software",
    "school app for parents",
    "attendance management",
    "fee collection software",
    "Indian school ERP",
    "EduOS",
  ],
  authors: [{ name: "EduOS" }],
  creator: "EduOS",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://eduos.com",
    siteName: "EduOS",
    title: "EduOS — The School ERP That Connects Everyone",
    description:
      "A unified operating system for administration, academics, and communication — attendance, grading, fee tracking, and parent engagement, all in one platform.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "EduOS — School ERP Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EduOS — Empowering Schools with Intelligent Management",
    description:
      "A powerful web portal for staff and a beautifully branded mobile app for parents — all in one platform.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/logo-mark.png",
    apple: "/logo-mark.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable, jakarta.variable)}>
      <body>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
