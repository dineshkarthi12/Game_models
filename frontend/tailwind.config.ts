import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.25rem', screens: { '2xl': '1240px' } },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6844F5',
          50: '#F3F0FF', 100: '#E9E3FF', 200: '#D3C7FE', 300: '#B39FFC', 400: '#8E6EF8',
          500: '#6844F5', 600: '#5732E0', 700: '#4626B8', 800: '#391F92', 900: '#2C1A6E',
        },
        accent: { DEFAULT: '#4C8DFF', 50: '#EEF4FF', 100: '#DCE8FF', 500: '#4C8DFF', 600: '#3474EA' },
        canvas: '#F7F8FC',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#18213B', muted: '#69738A', subtle: '#9AA2B5' },
        line: { DEFAULT: '#E7EAF2', strong: '#D6DBE7' },
        success: { DEFAULT: '#16A36A', 50: '#E8F7F0' },
        warning: { DEFAULT: '#E9A23B', 50: '#FDF4E6' },
        danger: { DEFAULT: '#DC5555', 50: '#FCEDED' },
        lavender: '#F4F1FE',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      boxShadow: {
        card: '0 1px 2px rgba(24,33,59,0.04), 0 1px 3px rgba(24,33,59,0.06)',
        raised: '0 4px 16px -4px rgba(24,33,59,0.10), 0 2px 4px rgba(24,33,59,0.04)',
        focus: '0 0 0 3px rgba(104,68,245,0.22)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
