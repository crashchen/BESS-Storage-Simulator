import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENE_3D } from '../config';

// Contract for the equipment GLBs copied from the (private) Switchyard repo:
// this public repo must not ship any of the known brand tokens below, and the
// files must stay valid single-buffer glTF 2.0 binaries so drei's useGLTF can
// load them without external textures or decoders. Re-copying a freshly built
// model from Switchyard without the de-brand pass should fail here, not in
// review. Extend the token list when assets from new suppliers are added.
const BANNED_BRAND_TOKENS = ['gotion'] as const;

// Vitest runs with the repo root as cwd (vitest.config.ts lives there).
const publicDir = resolve(process.cwd(), 'public');

function readGlbJsonChunk(file: string): string {
    const raw = readFileSync(resolve(publicDir, file));
    expect(raw.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(raw.readUInt32LE(4)).toBe(2); // container version
    expect(raw.readUInt32LE(8)).toBe(raw.byteLength); // declared total length
    const jsonLength = raw.readUInt32LE(12);
    expect(raw.subarray(16, 20).toString('ascii')).toBe('JSON');
    return raw.subarray(20, 20 + jsonLength).toString('utf-8');
}

describe('equipment GLB assets', () => {
    const models = Object.entries(SCENE_3D.models);

    it.each(models)('%s is a valid, self-contained glTF 2.0 binary', (_, model) => {
        const doc = JSON.parse(readGlbJsonChunk(model.file));
        expect(doc.asset.version).toBe('2.0');
        expect(doc.meshes.length).toBeGreaterThan(0);
        // Single embedded BIN buffer, no external URIs, no textures.
        expect(doc.buffers).toHaveLength(1);
        expect(doc.buffers[0].uri).toBeUndefined();
        expect(doc.images ?? []).toHaveLength(0);
    });

    it.each(models)('%s carries no banned brand tokens', (_, model) => {
        const json = readGlbJsonChunk(model.file).toLowerCase();
        for (const token of BANNED_BRAND_TOKENS) {
            expect(json).not.toContain(token);
        }
    });
});
