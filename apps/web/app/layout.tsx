import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Webhook Delivery Platform',
  description: 'Dashboard for the Webhook Delivery & Reliability Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 font-sans text-neutral-100 antialiased">
        <header className="border-b border-neutral-800">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Webhook Delivery <span className="text-neutral-500">&amp; Reliability Platform</span>
              </h1>
            </div>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="text-neutral-400 transition hover:text-neutral-100">
                Dashboard
              </a>
              <a href="/endpoints" className="text-neutral-400 transition hover:text-neutral-100">
                Endpoints
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
