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
      'kube-credential-jaimin.eastus.azurecontainer.io',
      'localhost',
      '127.0.0.1'
    ]
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts:[
      'kube-credential-jaimin.eastus.azurecontainer.io',
      'localhost',
      '127.0.0.1'
    ]
  },
})