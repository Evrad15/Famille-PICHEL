import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // Si tu es en v4

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})