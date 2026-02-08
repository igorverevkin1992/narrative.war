import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: parseInt(env.PORT || '3000', 10),
        host: mode === 'development' ? 'localhost' : '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        // WARNING: These keys are exposed in the client bundle.
        // TODO: Migrate to a backend proxy (Supabase Edge Function / API route)
        // so that API keys never reach the browser.
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
        'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
