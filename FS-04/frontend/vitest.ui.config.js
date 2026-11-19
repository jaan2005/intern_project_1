import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Tests in tests/ need the Django API running on http://localhost:8000 (set API_URL to change).
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', globals: true, testTimeout: 40000, include: ['tests/**/*.test.jsx', 'tests/**/*.test.js'], fileParallelism: false } });
