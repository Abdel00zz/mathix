/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)'],
        serif: ['var(--font-editorial)'],
        mono: ['var(--font-mono-ui)'],
        bricolage: ['var(--font-display)'],
        lora: ['var(--font-editorial)'],
        fira: ['var(--font-ui)'],
        'fira-sans': ['var(--font-ui)'],
        display: ['var(--font-display)'],
        arabic: ['var(--font-arabic)'],
      },
      colors: {
        paper: '#fcfbf8',
        ink: '#2c2b29',
        subtle: '#8e8a83',
        card: {
          primary: '#ffffff',
          hover: '#fef0fd',
          border: '#e8d8b7',
          borderHover: '#c5a059',
          pink: '#fef0fd',
          green: '#e1f7dc',
          yellow: '#fff4cc',
        },
        pistachio: {
          50:  '#F3F8EC',
          100: '#E4F1D4',
          200: '#C5E0A5',
          300: '#9DCA6E',
          400: '#78B24A',
          500: '#5A9832',
          600: '#467825',
          700: '#34591B',
          800: '#264213',
          900: '#1A2D0D',
          950: '#0D1806',
        },
        dashboard: {
          bg: '#f3f4f6', // Gris très léger (cool gray)
          text: '#1f2937', // Gris foncé (text)
          secondary: '#6b7280', // Gris moyen
          accent: '#C4502A', // Terracotta Dashboard Accent
          mauve: '#C5E0A5', // Vert pistache pastel
          mauvedark: '#467825', // Vert pistache foncé
          pink: '#EBF7DC', // Pistache très doux pour hover
          green: 'rgb(232, 245, 233)',
          yellow: 'rgb(255, 243, 191)',
        },
        border: '#d1d5db',
        focus: '#C4502A',
        primary: {
          DEFAULT: '#C4502A',
          hover: '#3D6E23',
          soft: '#F3F8EC',
          text: '#C4502A',
          legacy: '#5A9832',
        },
        accent: {
          DEFAULT: '#F2D049',
          soft: '#FEF9E6',
          text: '#8C6B0A',
          legacy: 'rgb(164, 134, 82)',
          light: 'rgb(180, 150, 100)',
          dark: 'rgb(140, 110, 60)',
        },
        navy: {
          900: '#001F3F',
        },
        gold: {
          DEFAULT: '#C5912C',
          500: '#D4AF37',
          600: '#B8860B',
        },
        'coursera-blue': '#5A8E3E',
        success: '#10b981',

        hub: {
          canvas: '#f8fafc',
          surface: '#ffffff',
          muted: '#f1f5f9',
        },

        stats: {
          level: '#10b981',
          course: '#6AAC43',
          time: '#5A8E3E',
        },

        system: {
          blue: '#5A8E3E',
          cyan: '#0891b2',
          violet: '#5A8E3E',
          slate: '#64748b',
          emerald: '#059669',
          rose: '#e11d48',
          pink: '#db2777',
          teal: '#0d9488',
          dark: '#0f172a',
          light: '#f8fafc',
          cream: '#fffbeb',
          border: '#e2e8f0',
          amber: '#d97706',
          alert: {
            start: '#ff922b',
            end: '#fa5252',
          },
        },
      },
      boxShadow: {
        'sm-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md-subtle': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'lg-subtle': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
        'card-hover': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      backgroundImage: {
        'subtle-dots': "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='1' fill='%2394a3b8' fill-opacity='0.2'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        shimmer: { '0%': { opacity: '0.5', transform: 'scale(0.98)' }, '50%': { opacity: '1', transform: 'scale(1)' }, '100%': { opacity: '0.5', transform: 'scale(0.98)' } },
        sweep: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(200%)' } },
        'scale-in': { '0%': { transform: 'scale(0.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        scribble: {
          '0%': { transform: 'rotate(0deg) translate(0,0)' },
          '20%': { transform: 'rotate(-5deg) translate(-2px, 1px)' },
          '40%': { transform: 'rotate(5deg) translate(2px, -1px)' },
          '60%': { transform: 'rotate(-5deg) translate(-1px, 2px)' },
          '80%': { transform: 'rotate(5deg) translate(1px, -2px)' },
          '100%': { transform: 'rotate(0deg) translate(0,0)' },
        },
        'glow-rotate': {
          '0%': { transform: 'translate(-50%, -50%) rotate(0deg)' },
          '100%': { transform: 'translate(-50%, -50%) rotate(360deg)' },
        },
        'progress-fill': {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(0.98)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'wave': {
          '0%': { transform: 'translateX(-150%) skewX(-20deg)' },
          '100%': { transform: 'translateX(300%) skewX(-20deg)' },
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'spin-slower': 'spin 6s linear infinite',
        'glow-slow': 'glow-rotate 25s linear infinite',
        'glow-fast': 'glow-rotate 8s linear infinite',
        'progress-fill': 'progress-fill 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'pulse-soft': 'pulse-soft 3s infinite',
        'slide-up': 'slide-up 0.5s ease-out forwards',
        'wave': 'wave 2s infinite',
      },
    },
  },
  plugins: [],
};
