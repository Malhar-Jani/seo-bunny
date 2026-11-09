import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import { ClientLayout } from "@/components/layout/ClientLayout";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "SEO Bunny — Local SEO & Maps Rank Tracker",
    description: "SEO Bunny by Mal — Local search rankings, review intelligence, and client growth studio",
    authors: [{ name: "Mal" }],
    creator: "Mal",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "SEO Bunny",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#c25430",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.variable} font-sans antialiased text-gray-900 bg-gray-50`}>
                <ClientLayout>
                    {children}
                </ClientLayout>
            </body>
        </html>
    );
}
