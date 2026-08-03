import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#10131d',
        'surface-lowest': '#0b0e17',
        'surface-low': '#181b25',
        'surface-container': '#1c1f29',
        'surface-high': '#272a34',
        'surface-highest': '#31343f',
        primary: '#adc6ff',
        'primary-strong': '#4d8eff',
        secondary: '#45dfa4',
        tertiary: '#ffb3ad',
        danger: '#ff6b65',
        warning: '#f59e0b',
        outline: '#424754',
        muted: '#c2c6d6',
        ink: '#e0e2f0',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        active: '0 0 8px rgba(69, 223, 164, .28)',
        focus: '0 0 0 3px rgba(173, 198, 255, .2)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.58' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
