import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Expose the emitted chart URL without fetching it. A retry must change the
// browser module-map key, not only replace React.lazy's rejected promise.
export function telemetryChunk(): Plugin {
    const virtualId = 'virtual:telemetry-chart-url';
    let root = '';
    let base = '/';
    let building = false;
    let reference: string | undefined;
    return {
        name: 'telemetry-chart-url',
        configResolved(config) {
            root = config.root;
            base = config.base;
            building = config.command === 'build';
        },
        resolveId(id) { if (id === virtualId) return '\0' + virtualId; },
        load(id) {
            if (id !== '\0' + virtualId) return;
            if (!building) return `export default ${JSON.stringify(base + 'src/components/TelemetryChart.tsx')}`;
            reference = this.emitFile({ type: 'chunk', id: resolve(root, 'src/components/TelemetryChart.tsx'),
                name: 'telemetry-chart', preserveSignature: 'allow-extension' });
            return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
        },
        generateBundle(_options, bundle) {
            if (!reference) return;
            const chartFile = this.getFileName(reference);
            const loaded = new Set<string>();
            const visit = (file: string) => {
                if (loaded.has(file)) return;
                loaded.add(file);
                const chunk = bundle[file];
                if (chunk?.type === 'chunk') chunk.imports.forEach(visit);
            };
            for (const chunk of Object.values(bundle)) {
                if (chunk.type === 'chunk' && chunk.isEntry && chunk.fileName !== chartFile) visit(chunk.fileName);
            }
            const chart = bundle[chartFile];
            if (chart?.type !== 'chunk' || chart.imports.some(file => !loaded.has(file))) {
                this.error('Chart retry requires all chart-only dependencies in its single chunk. Keep shared imports in the app startup graph.');
            }
            if (loaded.has(chartFile)) this.error('The telemetry chart must remain lazy, outside the startup import graph.');
        },
    };
}
