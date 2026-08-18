import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],

      // Senza questo elenco la misura non dice quello che il suo nome dichiara.
      //
      // Il provider v8 strumenta solo i moduli **caricati** durante i test: un
      // sorgente che nessun test importa non compare come 0%, semplicemente non
      // compare, e il denominatore si restringe da solo. Misurato prima di
      // introdurre questa riga: 16 file su 23 nel report, con quattro soglie
      // apparentemente rispettate che sul denominatore vero erano due rispettate
      // e due no (branches 64.96%, functions 69.34%).
      //
      // L'effetto peggiore non era il numero ma la deriva: ogni file nuovo
      // creato senza test sarebbe rientrato invisibile, facendo *salire* la
      // percentuale. Con l'elenco esplicito un file senza test pesa, come deve.
      //
      // Nessuna esclusione oltre a quelle qui sotto, che sono strutturali:
      // escludere un sorgente per far salire una percentuale sarebbe lo stesso
      // difetto con manie migliori. Un file a 0% ma visibile e' l'esito voluto.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx', // punto d'ingresso: monta l'app, nessuna logica
        'src/test/**', // infrastruttura di test
        'src/types/**', // tipi generati da openapi-typescript
        '**/*.config.{ts,js}',
      ],
      // Soglia MPC-CC del Piano di Qualifica (valore accettabile).
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
})
