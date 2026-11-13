import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', globals: true, testTimeout: 40000, include: ['ui.flow.test.jsx'] } });
