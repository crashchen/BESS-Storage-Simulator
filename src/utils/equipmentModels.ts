import { useGLTF } from '@react-three/drei';
import { SCENE_3D } from '../config';

export function equipmentModelUrl(file: string) {
    return import.meta.env.BASE_URL + file;
}

export function clearEquipmentModelCache() {
    // Each model is loaded with a single URL key. Clearing the array as a whole
    // would target a different useLoader/suspend-react cache entry.
    for (const model of Object.values(SCENE_3D.models)) {
        useGLTF.clear(equipmentModelUrl(model.file));
    }
}
