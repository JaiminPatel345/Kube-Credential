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
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'localhost',
      'localhost:5173',
      '127.0.0.1',
      '127.0.0.1:5173',
      'kube-credential-jaimin.eastus.azurecontainer.io',
      '.azurecontainer.io', // Allow all Azure container instances
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'localhost',
      'localhost:5173',
      '127.0.0.1',
      '127.0.0.1:5173',
      'kube-credential-jaimin.eastus.azurecontainer.io',
      '.azurecontainer.io', // Allow all Azure container instances
    ],
  },
})