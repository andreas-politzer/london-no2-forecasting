import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// On GitHub Pages the site lives under /london-no2-forecasting/.
// Local development (npm run dev) keeps the plain root path.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/london-no2-forecasting/' : '/',
  plugins: [react()],
}))