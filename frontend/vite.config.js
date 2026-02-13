import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'build', // Pour garder le même nom de dossier que CRA pour Vercel
  },
  server: {
    port: 3000, // Pour garder ton habitude du port 3000
  }
})