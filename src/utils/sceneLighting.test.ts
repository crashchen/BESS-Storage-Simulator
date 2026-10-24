import { describe, expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { SCENE_3D } from '../config';
import { createSceneLighting, getNightFactor, getSceneLighting, HEMISPHERE_GROUND_COLOR, SUN_LIGHT_COLOR } from './sceneLighting';

const minutes = (from: number, to: number) =>
    Array.from({ length: Math.round((to - from) * 60) + 1 }, (_, i) => from + i / 60);

describe('night lighting factor', () => {
    it('adds no night fill between the dawn and dusk windows', () => {
        for (const tod of minutes(7, 17)) expect(getNightFactor(tod)).toBe(0);
    });

    it('is fully on through the night, including across midnight', () => {
        for (const tod of [...minutes(19, 23.99), ...minutes(0, 5)]) expect(getNightFactor(tod)).toBe(1);
    });

    it('eases monotonically through dusk and dawn without a visible step', () => {
        const dusk = minutes(17, 19).map(getNightFactor);
        const dawn = minutes(5, 7).map(getNightFactor);
        for (let i = 1; i < dusk.length; i++) {
            expect(dusk[i]).toBeGreaterThanOrEqual(dusk[i - 1]);
            expect(dawn[i]).toBeLessThanOrEqual(dawn[i - 1]);
            expect(Math.abs(dusk[i] - dusk[i - 1])).toBeLessThan(0.02);
            expect(Math.abs(dawn[i] - dawn[i - 1])).toBeLessThan(0.02);
        }
    });

    it('is half on at the scene sunset and sunrise', () => {
        expect(getNightFactor(18)).toBeCloseTo(0.5, 6);
        expect(getNightFactor(6)).toBeCloseTo(0.5, 6);
    });
});

const faces = [
    [0, 0, 1], [0, 1, 0], [0, 0, -1],
    [1, 0, 0], [-1, 0, 0], [0, -1, 0],
] as const;
const sunColor = new Color(SUN_LIGHT_COLOR);
const moonColor = new Color(SCENE_3D.nightLighting.moonColor);
const groundColor = new Color(HEMISPHERE_GROUND_COLOR);
const moonDirection = new Vector3(...SCENE_3D.nightLighting.moonPosition).normalize();

// Unoccluded linear diffuse-light proxy, independent of tone mapping/materials.
// This checks the combined rig rather than only its scalar day/night factor.
function irradiance(lighting: ReturnType<typeof getSceneLighting>, normal: readonly number[]) {
    const n = new Vector3(...normal);
    const sunDirection = new Vector3(...lighting.sunPosition).normalize();
    const hemi = groundColor.clone().lerp(lighting.hemisphereSkyColor, 0.5 * n.y + 0.5);
    const sun = sunColor.clone().multiplyScalar(lighting.sunIntensity * Math.max(0, n.dot(sunDirection)));
    const moon = moonColor.clone().multiplyScalar(lighting.moonIntensity * Math.max(0, n.dot(moonDirection)));
    return lighting.ambientColor.clone().multiplyScalar(lighting.ambientIntensity)
        .add(hemi.multiplyScalar(lighting.hemisphereIntensity)).add(sun).add(moon).toArray();
}

function visibleChannels(time: number) {
    const lighting = getSceneLighting(time);
    return [...lighting.skyColor.toArray(), ...faces.flatMap(normal => irradiance(lighting, normal))];
}

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function faceIlluminances(time: number) {
    const lighting = getSceneLighting(time);
    return faces.map(normal => luminance(irradiance(lighting, normal)));
}

describe('complete scene lighting', () => {
    it('preserves the existing 7–17h daylight rig', () => {
        for (const time of minutes(7, 17)) {
            const light = getSceneLighting(time);
            const sky = new Color('#87CEEB').lerp(new Color('#4a9edb'), Math.abs(time - 12) / 6);
            for (const color of [light.skyColor, light.ambientColor, light.hemisphereSkyColor]) {
                color.toArray().forEach((value, i) => expect(value).toBeCloseTo(sky.toArray()[i], 12));
            }
            expect(light.ambientIntensity).toBeCloseTo(0.4 + 0.5 * Math.sin((time - 6) / 12 * Math.PI), 12);
            expect(light.hemisphereIntensity).toBeCloseTo(0.35, 12);
            expect(light.sunIntensity).toBeCloseTo(2 * Math.sin((time - 5.5) / 14 * Math.PI), 12);
            const angle = (time - 6) / 12 * Math.PI;
            light.sunPosition.forEach((value, i) => expect(value).toBeCloseTo(
                [80 * Math.cos(angle), 80 * Math.sin(angle), 30][i], 12,
            ));
            expect(light.moonIntensity).toBe(0);
        }
    });

    it.each([0, 5, 5.5, 6, 7, 12, 17, 18, 19, 19.5, 20, 24])(
        'keeps sky and combined light continuous across %sh', boundary => {
            const center = visibleChannels(boundary);
            for (const time of [boundary - 1e-6, boundary + 1e-6]) {
                visibleChannels(time).forEach((value, i) => expect(Math.abs(value - center[i])).toBeLessThan(2e-6));
            }
        },
    );

    it.each(['dawn', 'dusk'] as const)('has no combined-light trough on the six cardinal faces at %s', period => {
        const [from, to] = SCENE_3D.nightLighting[period];
        const direction = period === 'dawn' ? 1 : -1;
        let previous = faceIlluminances(from);
        const night = faceIlluminances(0);
        for (const time of minutes(from, to)) {
            const channels = faceIlluminances(time);
            channels.forEach((value, i) => {
                expect((value - previous[i]) * direction).toBeGreaterThanOrEqual(-1e-12);
                expect(value).toBeGreaterThanOrEqual(night[i] - 1e-12);
            });
            previous = channels;
        }
    });

    it('crossfades endpoint radiances without undershoot even on tilted faces', () => {
        for (const [from, to] of [SCENE_3D.nightLighting.dawn, SCENE_3D.nightLighting.dusk]) {
            for (const normal of [[0.2, 0.9, 0.4], [-0.8, 0.5, 0.3], [0.3, -0.4, -0.8]]) {
                const unit = new Vector3(...normal).normalize().toArray();
                const start = irradiance(getSceneLighting(from), unit);
                const end = irradiance(getSceneLighting(to), unit);
                for (const time of minutes(from, to)) {
                    irradiance(getSceneLighting(time), unit).forEach((value, i) => {
                        expect(value).toBeGreaterThanOrEqual(Math.min(start[i], end[i]) - 1e-12);
                        expect(value).toBeLessThanOrEqual(Math.max(start[i], end[i]) + 1e-12);
                    });
                }
            }
        }
    });

    it('keeps the night rig constant across midnight with the solar light off', () => {
        const midnight = visibleChannels(0);
        for (const time of minutes(19, 29)) {
            expect(getSceneLighting(time).sunIntensity).toBe(0);
            expect(visibleChannels(time)).toEqual(midnight);
        }
    });

    it('reuses only the caller-owned target and does not mutate another sample', () => {
        const target = createSceneLighting();
        const colors = [target.skyColor, target.ambientColor, target.hemisphereSkyColor];
        const noon = getSceneLighting(12);
        const before = JSON.stringify(noon);
        expect(getSceneLighting(6, target)).toBe(target);
        getSceneLighting(18, target);
        expect([target.skyColor, target.ambientColor, target.hemisphereSkyColor]).toEqual(colors);
        expect(JSON.stringify(noon)).toBe(before);
    });
});
