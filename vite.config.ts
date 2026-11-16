
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';
    // Logo officiel unique : utilisé pour les onglets, la PWA Android/iOS et les écrans d'accueil.
    const pwaIcon = '/icone.png';
    const pwaMaskable = '/logo.png';
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      
      plugins: [
        react(),
        VitePWA({
          // autoUpdate: Le nouveau SW s'active automatiquement et recharge la page
          // Cela resout le probleme des multiples F5 apres un deploiement
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          includeAssets: ['logo.png', 'logo-ar.png', 'icone.png', 'icone-ar.png', 'badge.png', 'manifest-ar.webmanifest'],
          manifest: {
            id: '/monprof-pwa',
            name: 'Apprendre intelligemen',
            short_name: 'Apprendre',
            description: 'Plateforme d\'apprentissage interactif des mathematiques pour les classes preparatoires au Maroc',
            theme_color: '#f5f0e8',
            background_color: '#f5f0e8',
            display: 'standalone',
            orientation: 'any',
            start_url: '/',
            scope: '/',
            lang: 'fr',
            dir: 'ltr',
            categories: ['education', 'productivity'],
            prefer_related_applications: false,
            // PWA shortcuts — acces rapide depuis l'icone (long press Android)
            shortcuts: [
              {
                name: 'Tableau de Bord',
                short_name: 'Dashboard',
                url: '/',
                icons: [{ src: pwaIcon, sizes: '1254x1254' }]
              }
            ],
            icons: [
              {
                src: pwaIcon,
                sizes: '1254x1254',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: pwaIcon,
                sizes: '1254x1254',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: pwaMaskable,
                sizes: '1254x1254',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 10_485_760,
            // Precache le shell (HTML/JS/CSS/fonts KaTeX) pour un lancement offline instantane
            globPatterns: ['**/*.{html,js,css,woff,woff2,ttf,eot}'],
            // Exclure les images lourdes et fichiers non-essentiels du precache
            // Elles seront mises en cache a la demande via runtimeCaching
            globIgnores: [
              '**/admin/**',
              // L'espace professeur dépend volontairement du cloud temps réel.
              // Ne jamais servir un ancien shell prof depuis le precache PWA.
              '**/prof/**',
              '**/*.map',
              '**/sw-push.js',
              '**/apprendre/**',
            ],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            // Injecter le handler push dans le SW
            importScripts: ['/sw-push.js'],
            // PAS de navigateFallback — Vercel gere le SPA routing via rewrites.
            // navigateFallback causait le SW a intercepter les requetes Google Fonts
            // apres F5, cassant le chargement des polices.
            navigateFallback: undefined,
            // NE PAS intercepter les requetes Google Fonts —
            // laisser le navigateur les gerer nativement pour eviter les bugs de cache SW
            navigateFallbackDenylist: [/^\/api\//, /^\/apprendre(?:\/|$)/],
            runtimeCaching: [
              // ── Google Fonts — NetworkOnly : le SW ne met rien en cache, le navigateur gere nativement ──
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'NetworkOnly',
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'NetworkOnly',
              },
              // ── JSON data — NetworkFirst pour la fraicheur ──
              {
                urlPattern: /\/data\/.*\.json$/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'json-data-cache',
                  networkTimeoutSeconds: 3,
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 24 * 60 * 60 // 1 jour
                  },
                  cacheableResponse: { statuses: [0, 200] }
                }
              },
              // ── Images locales (PNG/JPG/SVG) — Cache on demand ──
              {
                urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'images-cache',
                  expiration: {
                    maxEntries: 80,
                    maxAgeSeconds: 30 * 24 * 60 * 60 // 30 jours
                  },
                  cacheableResponse: { statuses: [0, 200] }
                }
              },
              // ── API calls — jamais de cache SW ──
              // Plusieurs routes transportent des réponses authentifiées
              // (professeur, progression, utilisateurs, notifications).
              {
                urlPattern: /^\/api\/.*/i,
                handler: 'NetworkOnly',
              }
            ]
          }
        })
      ],
      
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      },
      
      resolve: {
        alias: {
          '@': path.resolve('./src'),
        }
      },
      
      build: {
        target: 'es2022',
        chunkSizeWarningLimit: 1000,
        // Pas de sourcemap en production : 5,8 Mo de `.map` publiquement
        // servis exposaient tout le code source lisible.
        sourcemap: !isProd,
        cssCodeSplit: true,
        reportCompressedSize: false,
        
        rollupOptions: {
          output: {
            manualChunks: {
              'katex': ['katex'],
              'lucide': ['lucide-react'],
              'motion': ['motion'],
            },
            chunkFileNames: isProd ? 'assets/[name]-[hash].js' : 'assets/[name].js',
            entryFileNames: isProd ? 'assets/[name]-[hash].js' : 'assets/[name].js',
            assetFileNames: isProd ? 'assets/[name]-[hash].[ext]' : 'assets/[name].[ext]',
          }
        },
        
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: isProd,
            drop_debugger: isProd,
            pure_funcs: isProd ? ['console.log', 'console.info', 'console.debug'] : [],
          },
          mangle: {
            safari10: true,
          },
          format: {
            comments: false,
          },
        }
      },
      
      optimizeDeps: {
        include: ['react', 'react-dom', 'lucide-react'],
      },
      
      preview: {
        port: 4173,
        host: true,
      }
    };
});
