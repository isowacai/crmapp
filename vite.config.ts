import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { firebaseConfig } from './config/firebaseConfig.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Firebase config from dev.properties, available in the app as __FIREBASE_CONFIG__
    __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
