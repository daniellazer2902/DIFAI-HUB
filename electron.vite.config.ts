import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()] // garde node-pty hors du bundle (module natif)
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // pas de framework : vanilla TS
  }
})
