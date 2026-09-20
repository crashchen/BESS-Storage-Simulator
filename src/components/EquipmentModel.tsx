import { Clone, useGLTF } from '@react-three/drei';
import { SCENE_3D } from '../config';
import { equipmentModelUrl } from '../utils/equipmentModels';

type EquipmentModelSpec = (typeof SCENE_3D.models)[keyof typeof SCENE_3D.models];

export function EquipmentModel({ model }: { model: EquipmentModelSpec }) {
    const { scene } = useGLTF(equipmentModelUrl(model.file));
    return <Clone object={scene} scale={SCENE_3D.equipmentScale} castShadow receiveShadow />;
}
