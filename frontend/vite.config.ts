import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true, // allow all hosts in preview
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // allow all hosts in dev
  },
})
