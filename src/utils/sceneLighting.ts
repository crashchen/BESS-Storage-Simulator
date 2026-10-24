import { Color } from 'three';
import { SCENE_3D } from '../config';

// Shared by the rendered lights and the combined-illumination checks.
// Keep these as immutable colour inputs, not shared mutable Three Color objects.
export const SUN_LIGHT_COLOR = '#fff4e0';
export const HEMISPHERE_GROUND_COLOR = '#1a1a2e';

const NIGHT_SKY = new Color('#0a0a1a');
const DAY_SKY = new Color('#87CEEB');
const HORIZON_SKY = new Color('#4a9edb');
const NIGHT_HEMISPHERE = new Color(SCENE_3D.nightLighting.hemisphereSkyColor);
const NIGHT_AMBIENT_INTENSITY = 0.15;

const wrapDay = (time: number) => ((time % 24) + 24) % 24;

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** 0 by day, 1 by night. Eases across windows centred on sunrise and sunset
 * so night fill never pops in. */
export function getNightFactor(timeOfDay: number): number {
    const { dawn, dusk } = SCENE_3D.nightLighting;
    const time = wrapDay(timeOfDay);
    return time < 12
        ? 1 - smoothstep(dawn[0], dawn[1], time)
        : smoothstep(dusk[0], dusk[1], time);
}

export function createSceneLighting() {
    return {
        skyColor: new Color(),
        ambientColor: new Color(),
        hemisphereSkyColor: new Color(),
        ambientIntensity: 0,
        hemisphereIntensity: 0,
        sunIntensity: 0,
        moonIntensity: 0,
        sunPosition: [0, 0, 0] as [number, number, number],
    };
}

/** Sample display lighting, not physical irradiance or PV production.
 * Reuse a caller-owned target in the frame loop. Colours are linear RGB.
 * Crossfade complete light radiances (colour × intensity), not two independent
 * colour/intensity curves whose product can dip below either endpoint.
 */
export function getSceneLighting(timeOfDay: number, target = createSceneLighting()) {
    const night = SCENE_3D.nightLighting;
    const nightFactor = getNightFactor(timeOfDay);
    const dayFactor = 1 - nightFactor;
    // Hold the daylight rig at its boundary pose while fading. This prevents
    // a setting/rising sun from losing its top-face contribution before the
    // moon has taken over. During full night its position is irrelevant.
    const dayTime = Math.min(night.dusk[0], Math.max(night.dawn[1], wrapDay(timeOfDay)));
    const angle = ((dayTime - 6) / 12) * Math.PI;
    target.sunPosition[0] = Math.cos(angle) * 80;
    target.sunPosition[1] = Math.sin(angle) * 80;
    target.sunPosition[2] = 30;
    target.sunIntensity = dayFactor * 2 * Math.sin(((dayTime - 5.5) / 14) * Math.PI);
    target.moonIntensity = night.moonIntensity * nightFactor;

    target.skyColor.copy(DAY_SKY).lerp(HORIZON_SKY, Math.abs(dayTime - 12) / 6);
    const dayAmbient = 0.4 + 0.5 * Math.sin(((dayTime - 6) / 12) * Math.PI);
    target.ambientIntensity = dayAmbient * dayFactor + NIGHT_AMBIENT_INTENSITY * nightFactor;
    target.hemisphereIntensity = night.hemisphereIntensity.day * dayFactor
        + night.hemisphereIntensity.night * nightFactor;

    // Weighted colour interpolation keeps the actual light radiance linear
    // while retaining readable intensity settings on the Three light objects.
    target.ambientColor.copy(NIGHT_SKY).lerp(
        target.skyColor, dayAmbient * dayFactor / target.ambientIntensity,
    );
    target.hemisphereSkyColor.copy(NIGHT_HEMISPHERE).lerp(
        target.skyColor, night.hemisphereIntensity.day * dayFactor / target.hemisphereIntensity,
    );
    target.skyColor.lerp(NIGHT_SKY, nightFactor);
    return target;
}
