import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/') || id.includes('/node_modules/gsap/'))
            return 'galaxy';
          if (id.includes('/node_modules/zrender/')) return 'render';
          if (id.includes('/node_modules/echarts/')) return 'charts';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/'))
            return 'react';
        },
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
