import { defineConfig } from 'vitest/config';
import { telemetryChunk } from './build/telemetryChunk';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react(), telemetryChunk()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        css: true,
    },
});
