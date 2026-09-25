// ============================================================
// @Agent-3D (Spatial Architect) — MicrogridScene
// 3D rendering of the BESS container, solar array, and
// dynamic time-of-day lighting. Subscribes to GridState.
// ============================================================

import { memo, useRef, useMemo, Suspense } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Text, Grid, Line, useGLTF } from '@react-three/drei';
import { EquipmentModel, EquipmentModelPlaceholder } from './EquipmentModel';
import { SceneLabel } from './SceneLabel';
import { SceneCameraControls } from './SceneCameraControls';
import { type AmbientLight, BackSide, Color, Fog, type HemisphereLight, type Mesh, type MeshStandardMaterial, Vector3, CatmullRomCurve3 } from 'three';
import { SCENE_3D, SOLAR } from '../config';
import type { BatteryMode, MicrogridSceneProps, SceneAssetId } from '../types';
import { getVisibleEnergyFlows } from '../utils/energyFlowTelemetry';
import { FLOW_COLORS } from '../utils/sceneFlowVisuals';
import { selectBessPower } from '../utils/bessDisplay';
import { equipmentModelUrl } from '../utils/equipmentModels';

// ── Color palette ────────────────────────────────────────────
const COLOR_CHARGE = new Color('#22c55e');
const COLOR_DISCHARGE = new Color(FLOW_COLORS.bessToGrid);
// Lighter amber for the BESS → local-load leg; both BESS legs share the same
// upstream waypoints and would visually collide as identical amber streams.
const COLOR_DISCHARGE_LOAD = new Color(FLOW_COLORS.bessToLoad);
const COLOR_IDLE = new Color('#64748b');
const COLOR_SOLAR_ON = new Color('#facc15');
const COLOR_SOLAR_OFF = new Color('#1e293b');
const COLOR_SOLAR_FLOW = new Color(FLOW_COLORS.solar);
const COLOR_GRID_FLOW = new Color(FLOW_COLORS.grid);
const COLOR_CURTAIL = new Color(FLOW_COLORS.curtailed);

// SoC health gradient: red (0%) → amber (50%) → green (100%)
const SOC_COLOR_LOW = new Color('#ef4444');
const SOC_COLOR_MID = new Color('#f59e0b');
const SOC_COLOR_HIGH = new Color('#22c55e');
const _socColor = new Color();

function socHealthColor(soc: number): Color {
    if (soc < 50) {
        return _socColor.copy(SOC_COLOR_LOW).lerp(SOC_COLOR_MID, soc / 50);
    }
    return _socColor.copy(SOC_COLOR_MID).lerp(SOC_COLOR_HIGH, (soc - 50) / 50);
}

// ── Helper: Sun position from timeOfDay ──────────────────────
function sunPosition(tod: number): [number, number, number] {
    const angle = ((tod - 6) / 12) * Math.PI; // 6AM=0, 18PM=π
    const x = Math.cos(angle) * 80;
    const y = Math.sin(angle) * 80;
    const z = 30;
    return [x, Math.max(y, -10), z];
}

const SKY_NIGHT = new Color('#0a0a1a');
const SKY_DAWN_A = new Color('#1a1a3e');
const SKY_DAWN_B = new Color('#4a6fa5');
const SKY_DAY_A = new Color('#87CEEB');
const SKY_DAY_B = new Color('#4a9edb');
const _skyResult = new Color();
const _skyTmp = new Color();

function skyColor(tod: number): Color {
    if (tod < 5 || tod > 20) return _skyResult.copy(SKY_NIGHT);
    if (tod < 7) return _skyResult.copy(SKY_DAWN_A).lerp(_skyTmp.copy(SKY_DAWN_B), (tod - 5) / 2);
    if (tod > 18) return _skyResult.copy(SKY_DAWN_B).lerp(_skyTmp.copy(SKY_DAWN_A), (tod - 18) / 2);
    return _skyResult.copy(SKY_DAY_A).lerp(_skyTmp.copy(SKY_DAY_B), Math.abs(tod - 12) / 6);
}

// ── Interactive asset helpers ───────────────────────────────
interface AssetInteraction {
    isHighlighted: boolean;
    isSelected: boolean;
    handlers: {
        onPointerEnter: (event: ThreeEvent<PointerEvent>) => void;
        onPointerLeave: (event: ThreeEvent<PointerEvent>) => void;
        onClick: (event: ThreeEvent<MouseEvent>) => void;
    };
}

const noopHover = () => undefined;
const noopSelect = () => undefined;

function setSceneCursor(cursor: string) {
    if (typeof document !== 'undefined') {
        document.body.style.cursor = cursor;
    }
}

function createAssetInteraction(
    assetId: SceneAssetId,
    hoveredAssetId: SceneAssetId | null | undefined,
    selectedAssetId: SceneAssetId | null | undefined,
    onAssetHover: ((assetId: SceneAssetId | null) => void) | undefined,
    onAssetSelect: ((assetId: SceneAssetId) => void) | undefined,
): AssetInteraction {
    const hover = onAssetHover ?? noopHover;
    const select = onAssetSelect ?? noopSelect;
    const isSelected = selectedAssetId === assetId;

    return {
        isHighlighted: isSelected || hoveredAssetId === assetId,
        isSelected,
        handlers: {
            onPointerEnter: (event) => {
                event.stopPropagation();
                setSceneCursor('pointer');
                hover(assetId);
            },
            onPointerLeave: (event) => {
                event.stopPropagation();
                setSceneCursor('auto');
                hover(null);
            },
            onClick: (event) => {
                event.stopPropagation();
                select(assetId);
            },
        },
    };
}

// ── Equipment GLB models ─────────────────────────────────────
// Metre-scale, centre-ground-anchored static GLBs (public/models). Deep-cloned
// so the shadow flags reach every mesh. Highlight/overload feedback lives on
// separate overlay meshes — GLB materials are never mutated, keeping the cached
// GLTF pristine across canvas remounts.
// ── BESS Container ───────────────────────────────────────────
const BESS_MODEL = SCENE_3D.models.bessContainer;
const BESS_MODEL_WIDTH = BESS_MODEL.size[0] * SCENE_3D.equipmentScale;
const BESS_MODEL_HEIGHT = BESS_MODEL.size[1] * SCENE_3D.equipmentScale;
const BESS_MODEL_DEPTH = BESS_MODEL.size[2] * SCENE_3D.equipmentScale;
const BESS_PAD_TOP_Y = SCENE_3D.pads.bess.position[1] + SCENE_3D.pads.bess.size[1] / 2;
const BESS_MODEL_URL = equipmentModelUrl(BESS_MODEL.file);

useGLTF.preload(BESS_MODEL_URL);

// The detailed GLB remains fixed-scale: capacity edits describe the aggregate
// site, not a physically stretched representative container. Dynamic SoC,
// operating-state glow, and interaction feedback live in separate overlays.
const BESSContainer = memo(function BESSContainer({
    mode,
    soc,
    interaction,
}: {
    mode: BatteryMode;
    soc: number;
    interaction: AssetInteraction;
}) {
    const glowRef = useRef<Mesh>(null);

    const targetColor = mode === 'charging' ? COLOR_CHARGE : mode === 'discharging' ? COLOR_DISCHARGE : COLOR_IDLE;
    const activeSegments = Math.max(0, Math.min(8, Math.round((soc / 100) * 8)));
    const levelColor = useMemo(() => socHealthColor((activeSegments / 8) * 100).clone(), [activeSegments]);
    const currentColor = useRef(targetColor.clone());
    const socSegments = useMemo(() => {
        return Array.from({ length: 8 }, (_, index) => ({
            key: index,
            active: index < activeSegments,
            x: -0.37 + index * 0.105,
        }));
    }, [activeSegments]);

    useFrame((_, delta) => {
        currentColor.current.lerp(targetColor, 1 - Math.exp(-delta * 3));
        if (glowRef.current) {
            const mat = glowRef.current.material as MeshStandardMaterial;
            mat.emissive.copy(currentColor.current);
            mat.emissiveIntensity = 0.08 + (soc / 100) * 0.25;
            mat.opacity = 0.08 + (soc / 100) * 0.14;
        }
    });

    const interactionColor = interaction.isSelected ? '#67e8f9' : '#93c5fd';

    return (
        <group
            position={[SCENE_3D.pads.bess.position[0], BESS_PAD_TOP_Y, SCENE_3D.pads.bess.position[2]]}
            {...interaction.handlers}
        >
            {interaction.isHighlighted && (
                <mesh position={[0, BESS_MODEL_HEIGHT / 2, 0]} scale={[1.05, 1.08, 1.08]}>
                    <boxGeometry args={[BESS_MODEL_WIDTH, BESS_MODEL_HEIGHT, BESS_MODEL_DEPTH]} />
                    <meshStandardMaterial
                        color={interactionColor}
                        emissive={interactionColor}
                        emissiveIntensity={0.35}
                        transparent
                        opacity={0.18}
                        side={BackSide}
                    />
                </mesh>
            )}

            <Suspense fallback={<EquipmentModelPlaceholder model={BESS_MODEL} />}>
                <EquipmentModel model={BESS_MODEL} />
            </Suspense>

            {/* Compact SoC display occupies the space vacated by the logo. */}
            <group position={[-1.55, 2.08, BESS_MODEL_DEPTH / 2 + 0.035]}>
                <mesh>
                    <boxGeometry args={[1.22, 0.52, 0.07]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.55} />
                </mesh>
                <mesh position={[0.62, 0.08, 0.01]}>
                    <boxGeometry args={[0.08, 0.18, 0.08]} />
                    <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.45} />
                </mesh>
                <mesh position={[0, 0.08, 0.04]}>
                    <boxGeometry args={[0.94, 0.22, 0.025]} />
                    <meshStandardMaterial color="#020617" transparent opacity={0.92} />
                </mesh>
                {socSegments.map((segment) => (
                    <mesh key={segment.key} position={[segment.x, 0.08, 0.06]}>
                        <boxGeometry args={[0.075, 0.15, 0.03]} />
                        <meshStandardMaterial
                            color={segment.active ? levelColor : '#0f172a'}
                            emissive={segment.active ? levelColor : '#020617'}
                            emissiveIntensity={segment.active ? 0.9 : 0.05}
                            metalness={0.15}
                            roughness={0.25}
                        />
                    </mesh>
                ))}
                <Text
                    position={[0, -0.15, 0.06]}
                    fontSize={0.14}
                    maxWidth={1.0}
                    color="#dbeafe"
                    anchorX="center"
                    anchorY="middle"
                >
                    SOC {soc.toFixed(0)}%
                </Text>
            </group>

            {/* Glow shell */}
            <mesh ref={glowRef} position={[0, BESS_MODEL_HEIGHT / 2, 0]} scale={[1.03, 1.05, 1.05]}>
                <boxGeometry args={[BESS_MODEL_WIDTH, BESS_MODEL_HEIGHT, BESS_MODEL_DEPTH]} />
                <meshStandardMaterial
                    color="#000000"
                    transparent
                    side={BackSide}
                />
            </mesh>

            <SceneLabel position={[0, BESS_MODEL_HEIGHT + 0.38, 0]} highlighted={interaction.isHighlighted}>
                BESS UNIT
            </SceneLabel>
        </group>
    );
});

// ── Solar Panel ──────────────────────────────────────────────
// Brightness/color are computed once per render in SolarArray (since every panel
// sees the same value) and passed in as shared THREE objects. SolarPanel itself
// is memoized so identical color/intensity props don't re-render N×panel meshes.
const SolarPanel = memo(function SolarPanel({
    position,
    panelColor,
    emissiveIntensity,
}: {
    position: [number, number, number];
    panelColor: Color;
    emissiveIntensity: number;
}) {
    const supportHeight = position[1] - GROUND_POSITION[1];

    return (
        <group position={position}>
            <group rotation={[SCENE_3D.solarArray.panelTiltX, 0, 0]}>
                {/* Panel frame */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[...SCENE_3D.solarArray.panelSize]} />
                    <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
                </mesh>
                {/* Active surface */}
                <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.45, 0.88]} />
                    <meshStandardMaterial
                        color={panelColor}
                        emissive={COLOR_SOLAR_ON}
                        emissiveIntensity={emissiveIntensity}
                        metalness={0.9}
                        roughness={0.1}
                    />
                </mesh>
            </group>
            {/* Upright pole reaches the ground; its top cap embeds in the frame. */}
            <mesh position={[0, -supportHeight / 2, 0]}>
                <cylinderGeometry args={[0.05, 0.05, supportHeight]} />
                <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} />
            </mesh>
        </group>
    );
});

// ── Solar Array ──────────────────────────────────────────────
// memo so the panel grid only reconciles when capacity changes (rows/cols) or
// when output/brightness crosses a quantization bucket — see SolarPanel below.
const SolarArray = memo(function SolarArray({ solarOutputMw, solarAcCapacityMw, dcCapacityMwp }: { solarOutputMw: number; solarAcCapacityMw: number; dcCapacityMwp: number }) {
    // Scale panel grid: baseline 117 MWp = 3×4 grid.
    // Scale cols (3–6) and rows (2–5) with capacity ratio.
    const capacityRatio = dcCapacityMwp / SOLAR.dcCapacityMwp;
    const cols = Math.max(
        SCENE_3D.solarArray.minCols,
        Math.min(SCENE_3D.solarArray.maxCols, Math.round(SCENE_3D.solarArray.baselineCols * Math.sqrt(capacityRatio))),
    );
    const rows = Math.max(
        SCENE_3D.solarArray.minRows,
        Math.min(SCENE_3D.solarArray.maxRows, Math.round(SCENE_3D.solarArray.baselineRows * Math.sqrt(capacityRatio))),
    );

    const panels = useMemo(() => {
        const result: [number, number, number][] = [];
        const startX = SCENE_3D.solarArray.baseStartX -
            ((cols - SCENE_3D.solarArray.baselineCols) * SCENE_3D.solarArray.spacingX) / 2;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                result.push([
                    startX + col * SCENE_3D.solarArray.spacingX,
                    SCENE_3D.solarArray.panelHeight,
                    SCENE_3D.solarArray.baseStartZ + row * SCENE_3D.solarArray.spacingZ,
                ]);
            }
        }
        return result;
    }, [cols, rows]);

    // Discretize brightness into 5% buckets so the memoized Color (and the memo'd
    // child panels) only re-create when the bucket actually changes — not every
    // RAF frame when solarOutputMw drifts by 0.001 MW.
    const rawBrightness = solarOutputMw / Math.max(solarAcCapacityMw, 1e-9);
    const brightnessBucket = Math.round(Math.max(0, Math.min(1, rawBrightness)) * 20);
    const panelColor = useMemo(
        () => COLOR_SOLAR_OFF.clone().lerp(COLOR_SOLAR_ON, brightnessBucket / 20),
        [brightnessBucket],
    );
    const emissiveIntensity = (brightnessBucket / 20) * 0.8;

    return (
        <group>
            {panels.map((pos, i) => (
                <SolarPanel
                    key={i}
                    position={pos}
                    panelColor={panelColor}
                    emissiveIntensity={emissiveIntensity}
                />
            ))}
            <SceneLabel position={[-9.2, 2.65, -6.95]}>
                SOLAR ARRAY
            </SceneLabel>
        </group>
    );
});

const GRID_NODE_POSITION = SCENE_3D.gridNode.position;
const SITE_LOAD_POSITION = SCENE_3D.pads.siteLoad.position;
const TRANSFORMER_MODEL = SCENE_3D.models.mainTransformer;
const TRANSFORMER_WIDTH = TRANSFORMER_MODEL.size[0] * SCENE_3D.equipmentScale;
const TRANSFORMER_HEIGHT = TRANSFORMER_MODEL.size[1] * SCENE_3D.equipmentScale;
const TRANSFORMER_DEPTH = TRANSFORMER_MODEL.size[2] * SCENE_3D.equipmentScale;
const GRID_PYLON_HEIGHT = TRANSFORMER_HEIGHT + SCENE_3D.gridNode.pylonTopClearance;
const GRID_PYLON_POSITION: [number, number, number] = [
    GRID_NODE_POSITION[0],
    0,
    GRID_NODE_POSITION[2] - TRANSFORMER_DEPTH / 2 - SCENE_3D.gridNode.pylonRearClearance,
];

const PCS_SKID_MODEL = SCENE_3D.models.pcsMvSkid;
const PCS_SKID_HEIGHT = PCS_SKID_MODEL.size[1] * SCENE_3D.equipmentScale;
// Centre-ground GLB anchor: both the model and flow waypoint follow the pad.
const PCS_PAD_TOP_Y = SCENE_3D.pads.substation.position[1] + SCENE_3D.pads.substation.size[1] / 2;
const PCS_FLOW_HEIGHT = PCS_PAD_TOP_Y + PCS_SKID_HEIGHT + SCENE_3D.pads.substation.flowWaypointClearance;

// ── Power Lines (using Drei Line) ────────────────────────────
const POWER_LINE_POINTS: [number, number, number][] = [
    [-12.6, 3.1, -7.2],
    [-7.0, 3.9, -7.0],
    [-1.0, 4.0, -5.2],
    [SCENE_3D.pads.substation.position[0], PCS_FLOW_HEIGHT, SCENE_3D.pads.substation.position[2] - 2.05],
    [GRID_PYLON_POSITION[0], GRID_PYLON_HEIGHT, GRID_PYLON_POSITION[2]],
];

const POWER_PYLONS: { position: [number, number, number]; height: number }[] = [
    { position: [-12.6, 0, -7.2], height: 4 },
    { position: [-1.0, 0, -5.2], height: 4 },
    { position: GRID_PYLON_POSITION, height: GRID_PYLON_HEIGHT },
];

const PowerLines = memo(function PowerLines() {
    return (
        <group>
            {/* Pylons */}
            {POWER_PYLONS.map(({ position, height }, i) => (
                <group key={i} position={position}>
                    <mesh position={[0, height / 2, 0]}>
                        <cylinderGeometry args={[0.06, 0.08, height]} />
                        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, height, 0]}>
                        <boxGeometry args={[1.2, 0.08, 0.08]} />
                        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
                    </mesh>
                </group>
            ))}
            {/* Wire using Drei Line */}
            <Line points={POWER_LINE_POINTS} color="#94a3b8" lineWidth={1.5} />
        </group>
    );
});

// ── Grid Transformer ─────────────────────────────────────────

const LoadBuilding = memo(function LoadBuilding({
    interaction,
    overloaded,
}: {
    interaction: AssetInteraction;
    overloaded: boolean;
}) {
    const isActive = interaction.isHighlighted;
    const highlightColor = overloaded ? '#fb7185' : interaction.isSelected ? '#67e8f9' : '#93c5fd';

    return (
        <group position={GRID_NODE_POSITION} {...interaction.handlers}>
            {(isActive || overloaded) && (
                <mesh position={[0, TRANSFORMER_HEIGHT / 2, 0]}>
                    <boxGeometry
                        args={[TRANSFORMER_WIDTH + 0.35, TRANSFORMER_HEIGHT + 0.25, TRANSFORMER_DEPTH + 0.35]}
                    />
                    <meshStandardMaterial
                        color={highlightColor}
                        emissive={highlightColor}
                        emissiveIntensity={overloaded ? 0.55 : 0.25}
                        transparent
                        opacity={overloaded ? 0.22 : 0.12}
                        side={BackSide}
                    />
                </mesh>
            )}
            <Suspense fallback={<EquipmentModelPlaceholder model={TRANSFORMER_MODEL} />}>
                <EquipmentModel model={TRANSFORMER_MODEL} />
            </Suspense>
            {/* Offset beside the transformer for label spacing; its hit area keeps
                the whole visible tag selecting Grid, not just the part over the model. */}
            <SceneLabel position={[1.5, TRANSFORMER_HEIGHT + 0.1, 0]} highlighted={isActive} alert={overloaded} hitArea>
                GRID NODE
            </SceneLabel>
        </group>
    );
});

const SiteLoadMarker = memo(function SiteLoadMarker() {
    return (
        <group position={SITE_LOAD_POSITION}>
            <mesh position={[0, 0.05, 0]} receiveShadow>
                <boxGeometry args={[1.2, 0.1, 0.82]} />
                <meshStandardMaterial
                    color="#1e3a5f"
                    emissive="#2563eb"
                    emissiveIntensity={0.12}
                    roughness={0.55}
                    metalness={0.25}
                />
            </mesh>
            <mesh position={[0, 0.52, 0]} castShadow>
                <boxGeometry args={[0.64, 0.84, 0.52]} />
                <meshStandardMaterial
                    color="#475569"
                    emissive="#3b82f6"
                    emissiveIntensity={0.26}
                    roughness={0.42}
                    metalness={0.42}
                />
            </mesh>
            <mesh position={[0, 1.03, 0]} castShadow>
                <boxGeometry args={[0.86, 0.14, 0.66]} />
                <meshStandardMaterial
                    color="#60a5fa"
                    emissive="#3b82f6"
                    emissiveIntensity={0.62}
                    roughness={0.35}
                    metalness={0.35}
                />
            </mesh>
            <SceneLabel position={[0, 1.62, 0]} secondary>
                LOCAL LOAD
            </SceneLabel>
        </group>
    );
});

const SitePads = memo(function SitePads({ pcsInteraction }: { pcsInteraction: AssetInteraction }) {
    const solarPadSize = useMemo<[number, number, number]>(() => [...SCENE_3D.pads.solar.size], []);
    const bessPadSize = useMemo<[number, number, number]>(() => [...SCENE_3D.pads.bess.size], []);
    const substationPadSize = useMemo<[number, number, number]>(() => [...SCENE_3D.pads.substation.size], []);
    const substationHighlightSize = useMemo<[number, number, number]>(() => [
        SCENE_3D.pads.substation.size[0] + 0.32,
        SCENE_3D.pads.substation.size[1] + 0.02,
        SCENE_3D.pads.substation.size[2] + 0.32,
    ], []);
    const pcsActive = pcsInteraction.isHighlighted;
    const pcsHighlightColor = pcsInteraction.isSelected ? '#67e8f9' : SCENE_3D.pads.substation.emissiveColor;

    return (
        <group>
            <mesh position={SCENE_3D.pads.solar.position} receiveShadow>
                <boxGeometry args={solarPadSize} />
                <meshStandardMaterial color={SCENE_3D.pads.solar.color} roughness={0.92} metalness={0.05} />
            </mesh>
            <mesh position={SCENE_3D.pads.bess.position} receiveShadow>
                <boxGeometry args={bessPadSize} />
                <meshStandardMaterial color={SCENE_3D.pads.bess.color} roughness={0.78} metalness={0.12} />
            </mesh>
            {pcsActive && (
                <mesh position={SCENE_3D.pads.substation.position}>
                    <boxGeometry args={substationHighlightSize} />
                    <meshStandardMaterial
                        color={pcsHighlightColor}
                        emissive={pcsHighlightColor}
                        emissiveIntensity={0.5}
                        transparent
                        opacity={0.16}
                    />
                </mesh>
            )}
            <mesh position={SCENE_3D.pads.substation.position} castShadow receiveShadow {...pcsInteraction.handlers}>
                <boxGeometry args={substationPadSize} />
                <meshStandardMaterial
                    color={SCENE_3D.pads.substation.color}
                    emissive={SCENE_3D.pads.substation.emissiveColor}
                    emissiveIntensity={pcsActive ? 0.18 : 0.04}
                    roughness={0.5}
                    metalness={0.42}
                />
            </mesh>
            <group
                position={[SCENE_3D.pads.substation.position[0], PCS_PAD_TOP_Y, SCENE_3D.pads.substation.position[2]]}
                {...pcsInteraction.handlers}
            >
                <Line
                    points={[
                        [0, PCS_SKID_HEIGHT + 0.04, 0],
                        [0, PCS_FLOW_HEIGHT - PCS_PAD_TOP_Y, 0],
                    ]}
                    color={pcsHighlightColor}
                    lineWidth={pcsActive ? 4 : 2.5}
                    transparent
                    opacity={pcsActive ? 1 : 0.75}
                />
                <Suspense fallback={<EquipmentModelPlaceholder model={PCS_SKID_MODEL} />}>
                    <EquipmentModel model={PCS_SKID_MODEL} />
                </Suspense>
                <SceneLabel
                    // Offset from the central flow riser so it cannot bisect the label.
                    position={[-PCS_SKID_MODEL.size[0] * SCENE_3D.equipmentScale / 6, PCS_SKID_HEIGHT + 0.5, 0]}
                    highlighted={pcsActive}
                    mobileLift
                >
                    PCS / MV
                </SceneLabel>
            </group>
        </group>
    );
});

// ── Static scene primitives ─────────────────────────────────
// Ground + Grid + fog never change with the simulation tick, but they re-render
// any time the parent does because they sit inside the parent's JSX tree. Hoist
// them into a memoized component with stable props so React skips reconciliation
// for them on every 30 fps state update.
const GROUND_ARGS: [number, number] = [SCENE_3D.ground.size, SCENE_3D.ground.size];
const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const GROUND_POSITION: [number, number, number] = [0, -0.01, 0];
const GRID_POSITION: [number, number, number] = [0, 0, 0];
const GRID_ARGS: [number, number] = [...SCENE_3D.grid.args];

const StaticTerrain = memo(function StaticTerrain() {
    return (
        <>
            <mesh rotation={GROUND_ROTATION} receiveShadow position={GROUND_POSITION}>
                <planeGeometry args={GROUND_ARGS} />
                <meshStandardMaterial color={SCENE_3D.ground.color} />
            </mesh>
            <Grid
                args={GRID_ARGS}
                position={GRID_POSITION}
                cellSize={SCENE_3D.grid.cellSize}
                cellThickness={SCENE_3D.grid.cellThickness}
                cellColor={SCENE_3D.grid.cellColor}
                sectionSize={SCENE_3D.grid.sectionSize}
                sectionThickness={SCENE_3D.grid.sectionThickness}
                sectionColor={SCENE_3D.grid.sectionColor}
                fadeDistance={SCENE_3D.grid.fadeDistance}
                fadeStrength={SCENE_3D.grid.fadeStrength}
                infiniteGrid
            />
        </>
    );
});

// Site furniture is memoized so the static meshes skip 30 fps reconciliation;
// it only re-renders when interaction or overload feedback changes.
const StaticSiteFurniture = memo(function StaticSiteFurniture({
    pcsInteraction,
    gridInteraction,
    gridOverloadWarning,
}: {
    pcsInteraction: AssetInteraction;
    gridInteraction: AssetInteraction;
    gridOverloadWarning: boolean;
}) {
    return (
        <>
            <SitePads pcsInteraction={pcsInteraction} />
            <SiteLoadMarker />
            <PowerLines />
            <LoadBuilding interaction={gridInteraction} overloaded={gridOverloadWarning} />
        </>
    );
});

// ── Curtailment Particles ───────────────────────────────────
const MAX_CURTAILMENT_PARTICLES = SCENE_3D.particles.maxCurtailment;
const CURTAILMENT_BOUNDS = SCENE_3D.particles.curtailmentBounds;

function CurtailmentParticle({ offset, bounds, visible = true }: {
    offset: number;
    bounds: { x: number; z: number; spread: number };
    visible?: boolean;
}) {
    const meshRef = useRef<Mesh>(null);
    const progressRef = useRef(offset);

    useFrame((_, delta) => {
        if (!meshRef.current || !visible) return;
        progressRef.current = (progressRef.current + delta * 0.4) % 1;
        const t = progressRef.current;
        meshRef.current.position.set(
            bounds.x + Math.sin(t * Math.PI * 3 + offset * 10) * bounds.spread,
            2.2 + t * 3.5,
            bounds.z + Math.cos(t * Math.PI * 2 + offset * 7) * bounds.spread,
        );
        const fade = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        meshRef.current.scale.setScalar(0.06 + fade * 0.08);
        const mat = meshRef.current.material as MeshStandardMaterial;
        mat.opacity = fade * 0.85;
    });

    return (
        <mesh ref={meshRef} visible={visible}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshStandardMaterial
                color={COLOR_CURTAIL}
                emissive={COLOR_CURTAIL}
                emissiveIntensity={2}
                transparent
            />
        </mesh>
    );
}

function CurtailmentEffect({ curtailedMw, maxSolarMw }: { curtailedMw: number; maxSolarMw: number }) {
    const count = Math.min(MAX_CURTAILMENT_PARTICLES, Math.max(0, Math.ceil((curtailedMw / Math.max(maxSolarMw, 1)) * MAX_CURTAILMENT_PARTICLES)));

    return (
        <group visible={count > 0}>
            {Array.from({ length: MAX_CURTAILMENT_PARTICLES }).map((_, i) => (
                <CurtailmentParticle
                    key={i}
                    offset={i / MAX_CURTAILMENT_PARTICLES}
                    bounds={CURTAILMENT_BOUNDS}
                    visible={i < count}
                />
            ))}
        </group>
    );
}

// ── Energy Flow Paths ────────────────────────────────────────
// Define curved paths for energy particles
const SOLAR_FLOW_POINT = new Vector3(
    SCENE_3D.pads.solar.position[0],
    2.8,
    SCENE_3D.pads.solar.position[2] - 1.0,
);
const REAR_BUS_POINT_A = new Vector3(-5.8, 3.45, -6.4);
const REAR_BUS_POINT_B = new Vector3(-1.0, 3.55, -4.8);
const PCS_MV_FLOW_POINT = new Vector3(
    SCENE_3D.pads.substation.position[0],
    PCS_FLOW_HEIGHT,
    SCENE_3D.pads.substation.position[2],
);
const BESS_FLOW_PORT = new Vector3(
    SCENE_3D.pads.bess.position[0] + 2.6,
    2.55,
    SCENE_3D.pads.bess.position[2] - 1.25,
);
const BESS_BUS_POINT = new Vector3(BESS_FLOW_PORT.x, PCS_FLOW_HEIGHT, BESS_FLOW_PORT.z);
const GRID_FLOW_PORT = new Vector3(
    GRID_NODE_POSITION[0] - TRANSFORMER_WIDTH / 2 - 0.25,
    GRID_NODE_POSITION[1] + TRANSFORMER_HEIGHT + 0.2,
    GRID_NODE_POSITION[2] - TRANSFORMER_DEPTH / 4,
);
const GRID_FLOW_POINT = new Vector3(
    GRID_NODE_POSITION[0],
    GRID_NODE_POSITION[1] + TRANSFORMER_HEIGHT + 0.2,
    GRID_NODE_POSITION[2],
);
const SITE_LOAD_FLOW_POINT = new Vector3(
    SITE_LOAD_POSITION[0],
    1.18,
    SITE_LOAD_POSITION[2],
);
// Keep local-load branches above the enlarged skid, then descend at the marker.
const SITE_LOAD_BUS_POINT = new Vector3(SITE_LOAD_POSITION[0], PCS_FLOW_HEIGHT, SITE_LOAD_POSITION[2]);

function flowPoint(point: Vector3) {
    return point.clone();
}

const FLOW_PATHS = {
    // Solar array center → PCS/MV → BESS
    solarToBess: new CatmullRomCurve3(
        [
            flowPoint(SOLAR_FLOW_POINT),
            flowPoint(REAR_BUS_POINT_A),
            flowPoint(REAR_BUS_POINT_B),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(BESS_BUS_POINT),
            flowPoint(BESS_FLOW_PORT),
        ],
        false,
        'centripetal',
    ),
    // Solar array center → PCS/MV → Grid
    solarToGrid: new CatmullRomCurve3(
        [
            flowPoint(SOLAR_FLOW_POINT),
            flowPoint(REAR_BUS_POINT_A),
            flowPoint(REAR_BUS_POINT_B),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(GRID_FLOW_PORT),
            flowPoint(GRID_FLOW_POINT),
        ],
        false,
        'centripetal',
    ),
    // Solar array center → PCS/MV → site load marker (local PV consumption)
    solarToLoad: new CatmullRomCurve3(
        [
            flowPoint(SOLAR_FLOW_POINT),
            flowPoint(REAR_BUS_POINT_A),
            flowPoint(REAR_BUS_POINT_B),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(SITE_LOAD_BUS_POINT),
            flowPoint(SITE_LOAD_FLOW_POINT),
        ],
        false,
        'centripetal',
    ),
    // BESS → PCS/MV → Grid (export leg)
    bessToGrid: new CatmullRomCurve3(
        [
            flowPoint(BESS_FLOW_PORT),
            flowPoint(BESS_BUS_POINT),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(GRID_FLOW_PORT),
            flowPoint(GRID_FLOW_POINT),
        ],
        false,
        'centripetal',
    ),
    // BESS → PCS/MV → site load marker (local-load support)
    bessToLoad: new CatmullRomCurve3(
        [
            flowPoint(BESS_FLOW_PORT),
            flowPoint(BESS_BUS_POINT),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(SITE_LOAD_BUS_POINT),
            flowPoint(SITE_LOAD_FLOW_POINT),
        ],
        false,
        'centripetal',
    ),
    // Grid → PCS/MV → BESS (charging from grid)
    gridToBess: new CatmullRomCurve3(
        [
            flowPoint(GRID_FLOW_POINT),
            flowPoint(GRID_FLOW_PORT),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(BESS_BUS_POINT),
            flowPoint(BESS_FLOW_PORT),
        ],
        false,
        'centripetal',
    ),
    // Grid → PCS/MV → site load marker (import serving local demand)
    gridToSite: new CatmullRomCurve3(
        [
            flowPoint(GRID_FLOW_POINT),
            flowPoint(GRID_FLOW_PORT),
            flowPoint(PCS_MV_FLOW_POINT),
            flowPoint(SITE_LOAD_BUS_POINT),
            flowPoint(SITE_LOAD_FLOW_POINT),
        ],
        false,
        'centripetal',
    ),
};

// ── Energy Particle ──────────────────────────────────────────
const MAX_ENERGY_PARTICLES = SCENE_3D.particles.maxEnergy;

interface EnergyParticleProps {
    curve: CatmullRomCurve3;
    color: Color;
    speed: number;
    offset: number;
    size: number;
    intensity: number;
    visible?: boolean;
}

function EnergyParticle({ curve, color, speed, offset, size, intensity, visible = true }: EnergyParticleProps) {
    const meshRef = useRef<Mesh>(null);
    const progressRef = useRef((offset % 1));
    const pointRef = useRef(new Vector3());

    useFrame((_, delta) => {
        if (!meshRef.current || !visible) return;

        progressRef.current = (progressRef.current + delta * speed) % 1;
        curve.getPoint(progressRef.current, pointRef.current);
        meshRef.current.position.copy(pointRef.current);

        // Pulse effect
        const pulse = 0.8 + 0.4 * Math.sin(progressRef.current * Math.PI * 4);
        meshRef.current.scale.setScalar(size * pulse);
    });

    return (
        <mesh ref={meshRef} visible={visible}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={intensity}
                transparent
                opacity={0.9}
            />
        </mesh>
    );
}

// ── Energy Flow Stream ───────────────────────────────────────
interface EnergyFlowProps {
    curve: CatmullRomCurve3;
    color: Color;
    powerMw: number;
    maxPowerMw: number;
    active: boolean;
}

function EnergyFlow({ curve, color, powerMw, maxPowerMw, active }: EnergyFlowProps) {
    const isActive = active && powerMw >= 0.5;
    const ratio = powerMw / Math.max(maxPowerMw, 1e-9);
    const particleCount = isActive ? Math.max(3, Math.min(MAX_ENERGY_PARTICLES, Math.ceil(ratio * MAX_ENERGY_PARTICLES))) : 0;
    const intensity = 0.5 + ratio * 1.5;
    const baseSize = 0.08 + ratio * 0.12;
    const speed = 0.3 + ratio * 0.4;

    // Get points for the flow line — curves are static, compute once
    const linePoints = useMemo(() => {
        return curve.getPoints(20).map(p => [p.x, p.y, p.z] as [number, number, number]);
    }, [curve]);

    return (
        <group visible={isActive}>
            {/* Glowing path line */}
            <Line
                points={linePoints}
                color={color}
                lineWidth={1.5 + ratio * 2}
                transparent
                opacity={0.3 + ratio * 0.3}
            />
            {/* Energy particles — pooled to avoid mount/unmount churn */}
            {Array.from({ length: MAX_ENERGY_PARTICLES }).map((_, i) => (
                <EnergyParticle
                    key={i}
                    curve={curve}
                    color={color}
                    speed={speed}
                    offset={i / MAX_ENERGY_PARTICLES}
                    size={baseSize}
                    intensity={intensity}
                    visible={i < particleCount}
                />
            ))}
        </group>
    );
}

// ── Energy Flow Controller ───────────────────────────────────
interface EnergyFlowSystemProps {
    solarToBessMw: number;
    solarToLoadMw: number;
    solarToExportMw: number;
    bessToLoadMw: number;
    bessToExportMw: number;
    gridToBessMw: number;
    gridToSiteMw: number;
    maxSolarMw: number;
    maxBessMw: number;
    maxGridMw: number;
}

function EnergyFlowSystem({
    solarToBessMw,
    solarToLoadMw,
    solarToExportMw,
    bessToLoadMw,
    bessToExportMw,
    gridToBessMw,
    gridToSiteMw,
    maxSolarMw,
    maxBessMw,
    maxGridMw,
}: EnergyFlowSystemProps) {
    return (
        <group>
            {/* Solar → BESS (charging from solar surplus) */}
            <EnergyFlow
                curve={FLOW_PATHS.solarToBess}
                color={COLOR_SOLAR_FLOW}
                powerMw={solarToBessMw}
                maxPowerMw={maxBessMw}
                active={solarToBessMw > 0.5}
            />

            {/* Solar → local load (direct PV consumption) */}
            <EnergyFlow
                curve={FLOW_PATHS.solarToLoad}
                color={COLOR_SOLAR_FLOW}
                powerMw={solarToLoadMw}
                maxPowerMw={maxSolarMw}
                active={solarToLoadMw > 0.5}
            />

            {/* Solar → Grid node (direct export) */}
            <EnergyFlow
                curve={FLOW_PATHS.solarToGrid}
                color={COLOR_SOLAR_FLOW}
                powerMw={solarToExportMw}
                maxPowerMw={maxSolarMw}
                active={solarToExportMw > 0.5}
            />

            {/* BESS → local load (avoided-import discharge) — lighter amber
                so it stays distinct from the export leg when both are active. */}
            <EnergyFlow
                curve={FLOW_PATHS.bessToLoad}
                color={COLOR_DISCHARGE_LOAD}
                powerMw={bessToLoadMw}
                maxPowerMw={maxBessMw}
                active={bessToLoadMw > 0.5}
            />

            {/* BESS → Grid node (export to grid) */}
            <EnergyFlow
                curve={FLOW_PATHS.bessToGrid}
                color={COLOR_DISCHARGE}
                powerMw={bessToExportMw}
                maxPowerMw={maxBessMw}
                active={bessToExportMw > 0.5}
            />
            
            {/* Grid → BESS (charging from grid) */}
            <EnergyFlow
                curve={FLOW_PATHS.gridToBess}
                color={COLOR_GRID_FLOW}
                powerMw={gridToBessMw}
                maxPowerMw={maxBessMw}
                active={gridToBessMw > 0.5}
            />

            {/* Grid → Site bus (import serving local demand) */}
            <EnergyFlow
                curve={FLOW_PATHS.gridToSite}
                color={COLOR_GRID_FLOW}
                powerMw={gridToSiteMw}
                maxPowerMw={maxGridMw}
                active={gridToSiteMw > 0.5}
            />
        </group>
    );
}

// ── Main Scene ───────────────────────────────────────────────
export function MicrogridScene({
    gridState,
    viewResetVersion = 0,
    hoveredAssetId,
    selectedAssetId,
    onAssetHover,
    onAssetSelect,
}: MicrogridSceneProps) {
    const {
        batterySocPercent,
        solarOutputMw,
        solarAcCapacityMw,
        timeOfDay,
        solarCurtailedMw,
        batteryPowerRatingMw,
        solarDcCapacityMwp,
        gridPvEvacuationMw,
        gridBessConnectionMw,
        gridOverloadWarning,
    } = gridState;

    const sunPos = sunPosition(timeOfDay);
    const ambientIntensity = timeOfDay > 6 && timeOfDay < 19
        ? 0.4 + 0.5 * Math.sin(((timeOfDay - 6) / 12) * Math.PI)
        : 0.15;
    const sunIntensity = timeOfDay > 5.5 && timeOfDay < 19.5
        ? 2.0 * Math.sin(((timeOfDay - 5.5) / 14) * Math.PI)
        : 0.1;

    const maxBessMw = Math.min(batteryPowerRatingMw, gridBessConnectionMw);
    const maxGridMw = gridPvEvacuationMw + gridBessConnectionMw;
    const visibleFlows = getVisibleEnergyFlows(gridState);
    // useMemo so memoized children (StaticSiteFurniture, LoadBuilding) keep their memo
    // — without it, fresh objects + closures every render reconcile the static subtree.
    const bessInteraction = useMemo(
        () => createAssetInteraction('bess', hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect),
        [hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect],
    );
    const pcsInteraction = useMemo(
        () => createAssetInteraction('pcs-mv', hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect),
        [hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect],
    );
    const gridInteraction = useMemo(
        () => createAssetInteraction('grid-node', hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect),
        [hoveredAssetId, selectedAssetId, onAssetHover, onAssetSelect],
    );

    const fogRef = useRef<Fog>(null);
    const ambientRef = useRef<AmbientLight>(null);
    const hemiRef = useRef<HemisphereLight>(null);

    useFrame(() => {
        const sky = skyColor(timeOfDay);
        if (fogRef.current) fogRef.current.color.copy(sky);
        if (ambientRef.current) ambientRef.current.color.copy(sky);
        if (hemiRef.current) hemiRef.current.color.copy(sky);
    });

    return (
        <>
            {/* Lighting — boosted for visibility */}
            <ambientLight ref={ambientRef} intensity={ambientIntensity} />
            <directionalLight
                position={sunPos}
                intensity={sunIntensity}
                color="#fff4e0"
                castShadow
                shadow-mapSize-width={SCENE_3D.shadows.mapSize}
                shadow-mapSize-height={SCENE_3D.shadows.mapSize}
                shadow-camera-far={SCENE_3D.shadows.cameraFar}
                shadow-camera-left={-SCENE_3D.shadows.cameraBounds}
                shadow-camera-right={SCENE_3D.shadows.cameraBounds}
                shadow-camera-top={SCENE_3D.shadows.cameraBounds}
                shadow-camera-bottom={-SCENE_3D.shadows.cameraBounds}
            />
            <hemisphereLight
                ref={hemiRef}
                groundColor="#1a1a2e"
                intensity={0.35}
            />
            {/* Fill light so objects are always somewhat visible */}
            <pointLight position={[0, 10, 10]} intensity={0.5} color="#94a3b8" />

            {/* Fog */}
            <fog ref={fogRef} attach="fog" args={[SCENE_3D.fog.color, SCENE_3D.fog.near, SCENE_3D.fog.far]} />

            {/* Static environment — memoized around interaction/overload changes */}
            <StaticTerrain />
            <StaticSiteFurniture
                pcsInteraction={pcsInteraction}
                gridInteraction={gridInteraction}
                gridOverloadWarning={gridOverloadWarning}
            />

            {/* Dynamic scene objects */}
            <BESSContainer
                mode={selectBessPower(gridState).powerMode}
                soc={batterySocPercent}
                interaction={bessInteraction}
            />
            <SolarArray solarOutputMw={solarOutputMw} solarAcCapacityMw={solarAcCapacityMw} dcCapacityMwp={solarDcCapacityMwp} />

            {/* Energy flow animations */}
            <EnergyFlowSystem
                solarToBessMw={visibleFlows.solarToBessMw}
                solarToLoadMw={visibleFlows.solarToLoadMw}
                solarToExportMw={visibleFlows.solarToExportMw}
                bessToLoadMw={visibleFlows.bessToLoadMw}
                bessToExportMw={visibleFlows.bessToExportMw}
                gridToBessMw={visibleFlows.gridToBessMw}
                gridToSiteMw={visibleFlows.gridToSiteMw}
                maxSolarMw={solarAcCapacityMw}
                maxBessMw={maxBessMw}
                maxGridMw={maxGridMw}
            />

            {/* Curtailment visual */}
            <CurtailmentEffect curtailedMw={solarCurtailedMw} maxSolarMw={solarAcCapacityMw} />

            {/* Camera controls */}
            <SceneCameraControls resetVersion={viewResetVersion} />
        </>
    );
}
