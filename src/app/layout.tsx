import React, { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { AppProvider } from '@/components/AppProvider';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ModalsHost } from '@/components/ModalsHost';
import { SidebarRail } from '@/components/SidebarRail';
import { normalizeClassId } from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';
import { resolveRouteView } from '@/lib/routeView';
import './globals.css';

export const metadata: Metadata = {
  title: 'Apprendre — Programme',
  description: 'Cahier mathématique interactif Lycée : fiches de cours, quiz chronométrés et exercices corrigés.',
  manifest: '/apprendre.webmanifest',
  icons: {
    icon: '/icons/badge.png',
    apple: '/icons/icone.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Apprendre',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F4EF' },
    { media: '(prefers-color-scheme: dark)', color: '#12141C' },
  ],
};

const BOOTSTRAP_SCRIPT = `try{var r=document.documentElement,p=JSON.parse(localStorage.getItem('ap-p')||'null');if(p){if(p.th==='light'||p.th==='dark')r.dataset.theme=p.th;if(p.docFont)r.setAttribute('data-doc-font',p.docFont);if(p.reduceMotion)r.setAttribute('data-reduce-motion','true');if(p.docScale){var s=String(p.docScale);r.style.setProperty('--doc-scale',s);r.style.setProperty('--mf-doc-scale',s);}}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialClassId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);
  const initialView = resolveRouteView((await headers()).get('x-apprendre-path') || '/');

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600;7..72,700&family=Noto+Sans+Arabic:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
      </head>
      <body data-v={initialView}>
        <div className="paint" aria-hidden="true" />
        <div className="sheet" aria-hidden="true" />
        <AppProvider initialClassId={initialClassId}>
          <SidebarRail />
          <main>
            <Suspense fallback={<p role="status">Chargement du contenu…</p>}>
              {children}
            </Suspense>
          </main>
          <MobileBottomNav />
          <ModalsHost />
        </AppProvider>
      </body>
    </html>
  );
}
