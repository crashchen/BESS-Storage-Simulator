import { Clone, useGLTF } from '@react-three/drei';
import { SCENE_3D } from '../config';
import { equipmentModelUrl } from '../utils/equipmentModels';

type EquipmentModelSpec = (typeof SCENE_3D.models)[keyof typeof SCENE_3D.models];

export function EquipmentModel({ model }: { model: EquipmentModelSpec }) {
    const { scene } = useGLTF(equipmentModelUrl(model.file));
    return <Clone object={scene} scale={SCENE_3D.equipmentScale} castShadow receiveShadow />;
}

export function EquipmentModelPlaceholder({ model }: { model: EquipmentModelSpec }) {
    const [width, height, depth] = model.size.map(dimension => dimension * SCENE_3D.equipmentScale);
    return (
        <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color="#475569" metalness={0.2} roughness={0.8} transparent opacity={0.8} />
        </mesh>
    );
}
