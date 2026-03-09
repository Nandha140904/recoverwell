import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // In development, proxy /api/* to the Express backend (port 3001) so the
  // Fast2SMS API key stays server-side and is never exposed to the browser.
  server: {
    port: 5173,
    host: "0.0.0.0", // Allow connection from remote devices on the same network
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/.netlify/functions': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace('/.netlify/functions/', '/api/fn/'),
      },
    },
  },
})
