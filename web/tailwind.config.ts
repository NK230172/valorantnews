import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        val: {
          bg:   '#0F1923',
          card: '#1A2631',
          red:  '#FF4655',
          text: '#ECE8E1',
          muted:'#8B95A1',
          border:'#2A3A4A',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
