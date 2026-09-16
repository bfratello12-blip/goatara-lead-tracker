import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(process.env.VITE_PORT ?? env.VITE_PORT ?? 5173),
      host: '127.0.0.1',
      proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? env.PORT ?? 3001}` },
    },
    build: { sourcemap: false },
  };
});
