import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'

const projectRoot = process.env.PROJECT_ROOT || resolve(import.meta.dirname, '..')

export function createRendererConfig() {
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': resolve(projectRoot, 'src') } },
  }
}
