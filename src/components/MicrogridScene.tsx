// ============================================================
// @Agent-3D (Spatial Architect) — MicrogridScene
// 3D rendering of the BESS container, solar array, and
// dynamic time-of-day lighting. Subscribes to GridState.
// ============================================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Line } from '@react-three/drei';
import { type AmbientLight, BackSide, Color, Fog, type HemisphereLight, type Mesh, type MeshStandardMaterial, Vector3, CatmullRomCurve3 } from 'three';
import type { BatteryMode, MicrogridSceneProps } from '../types';

// ── Color palette ────────────────────────────────────────────
const COLOR_CHARGE = new Color('#22c55e');
const COLOR_DISCHARGE = new Color('#f59e0b');
const COLOR_IDLE = new Color('#64748b');
const COLOR_SOLAR_ON = new Color('#facc15');
const COLOR_SOLAR_OFF = new Color('#1e293b');
const COLOR_SOLAR_FLOW = new Color('#fbbf24');
const COLOR_GRID_FLOW = new Color('#3b82f6');

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

// ── BESS Container ───────────────────────────────────────────
function BESSContainer({ mode, soc }: { mode: BatteryMode; soc: number }) {
    const meshRef = useRef<Mesh>(null);
    const glowRef = useRef<Mesh>(null);

    const targetColor = mode === 'charging' ? COLOR_CHARGE : mode === 'discharging' ? COLOR_DISCHARGE : COLOR_IDLE;
    const levelColor = targetColor;
    const currentColor = useRef(targetColor.clone());
    const socSegments = useMemo(() => {
        const segmentCount = 8;
        const activeSegments = Math.max(0, Math.min(segmentCount, Math.round((soc / 100) * segmentCount)));

        return Array.from({ length: segmentCount }, (_, index) => ({
            key: index,
            active: index < activeSegments,
            y: -0.95 + index * 0.28,
        }));
    }, [soc]);
    const fillHeight = Math.max(0.08, (soc / 100) * 2.0);
    const fillCenterY = -1.0 + fillHeight / 2;

    useFrame(() => {
        currentColor.current.lerp(targetColor, 0.05);
        if (meshRef.current) {
            const mat = meshRef.current.material as MeshStandardMaterial;
            mat.emissive.copy(currentColor.current);
            mat.emissiveIntensity = 0.3 + (soc / 100) * 0.7;
        }
        if (glowRef.current) {
            const mat = glowRef.current.material as MeshStandardMaterial;
            mat.emissive.copy(currentColor.current);
            mat.emissiveIntensity = 0.1 + (soc / 100) * 0.5;
            mat.opacity = 0.15 + (soc / 100) * 0.2;
        }
    });

    return (
        <group position={[0, 1.5, 0]}>
            {/* Main container body */}
            <mesh ref={meshRef} castShadow receiveShadow>
                <boxGeometry args={[4, 3, 2]} />
                <meshStandardMaterial
                    color="#1e293b"
                    metalness={0.8}
                    roughness={0.3}
                    emissive={COLOR_IDLE}
                    emissiveIntensity={0.3}
                />
            </mesh>

            {/* Battery-style SoC viewport */}
            <group position={[0, 0, 1.04]}>
                <mesh>
                    <boxGeometry args={[1.55, 2.35, 0.12]} />
                    <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.55} />
                </mesh>
                <mesh position={[0, 1.28, 0.02]}>
                    <boxGeometry args={[0.38, 0.18, 0.12]} />
                    <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.45} />
                </mesh>
                <mesh position={[0, 0, 0.03]}>
                    <boxGeometry args={[1.28, 2.05, 0.04]} />
                    <meshStandardMaterial color="#020617" transparent opacity={0.92} />
                </mesh>
                <mesh position={[0, fillCenterY, 0.05]}>
                    <boxGeometry args={[1.08, fillHeight, 0.03]} />
                    <meshStandardMaterial
                        color={levelColor}
                        emissive={levelColor}
                        emissiveIntensity={0.35 + (soc / 100) * 0.55}
                        transparent
                        opacity={0.32}
                    />
                </mesh>
                {socSegments.map((segment) => (
                    <mesh key={segment.key} position={[0, segment.y, 0.06]}>
                        <boxGeometry args={[1.0, 0.18, 0.05]} />
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
                    position={[0, -1.22, 0.08]}
                    fontSize={0.18}
                    maxWidth={1.15}
                    color="#dbeafe"
                    anchorX="center"
                    anchorY="middle"
                >
                    SOC {soc.toFixed(0)}%
                </Text>
            </group>

            {/* Glow shell */}
            <mesh ref={glowRef} scale={[1.08, 1.08, 1.08]}>
                <boxGeometry args={[4, 3, 2]} />
                <meshStandardMaterial
                    color="#000000"
                    emissive={COLOR_IDLE}
                    emissiveIntensity={0.3}
                    transparent
                    opacity={0.2}
                    side={BackSide}
                />
            </mesh>

            {/* Label */}
            <Text
                position={[0, 2.2, 0]}
                fontSize={0.4}
                color="#e2e8f0"
                anchorX="center"
                anchorY="bottom"
            >
                BESS UNIT
            </Text>

            {/* Mounting base */}
            <mesh position={[0, -1.7, 0]} receiveShadow>
                <boxGeometry args={[4.5, 0.3, 2.5]} />
                <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.2} />
            </mesh>
        </group>
    );
}

// ── Solar Panel ──────────────────────────────────────────────
function SolarPanel({
    position,
    solarOutputMw,
    solarAcCapacityMw,
}: {
    position: [number, number, number];
    solarOutputMw: number;
    solarAcCapacityMw: number;
}) {
    const brightness = solarOutputMw / Math.max(solarAcCapacityMw, 1e-9);
    const panelColor = useMemo(
        () => COLOR_SOLAR_OFF.clone().lerp(COLOR_SOLAR_ON, brightness),
        [brightness],
    );

    return (
        <group position={position} rotation={[-0.35, 0, 0]}>
            {/* Panel frame */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1.8, 0.06, 1.2]} />
                <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Active surface */}
            <mesh position={[0, 0.035, 0]}>
                <planeGeometry args={[1.6, 1.0]} />
                <meshStandardMaterial
                    color={panelColor}
                    emissive={COLOR_SOLAR_ON}
                    emissiveIntensity={brightness * 0.8}
                    metalness={0.9}
                    roughness={0.1}
                />
            </mesh>
            {/* Support pole */}
            <mesh position={[0, -0.6, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 1.2]} />
                <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} />
            </mesh>
        </group>
    );
}

// ── Solar Array ──────────────────────────────────────────────
function SolarArray({ solarOutputMw, solarAcCapacityMw }: { solarOutputMw: number; solarAcCapacityMw: number }) {
    const panels = useMemo(() => {
        const result: [number, number, number][] = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                result.push([-10 + col * 2.2, 1.2, -4 + row * 1.8]);
            }
        }
        return result;
    }, []);

    return (
        <group>
            {panels.map((pos, i) => (
                <SolarPanel key={i} position={pos} solarOutputMw={solarOutputMw} solarAcCapacityMw={solarAcCapacityMw} />
            ))}
            <Text
                position={[-6.5, 3, -4]}
                fontSize={0.35}
                color="#e2e8f0"
                anchorX="center"
                anchorY="bottom"
            >
                SOLAR ARRAY
            </Text>
        </group>
    );
}

// ── Power Lines (using Drei Line) ────────────────────────────
function PowerLines() {
    const wirePoints = useMemo<[number, number, number][]>(() => [
        [-6, 3, 0],
        [-3, 4, 0],
        [0, 4, 0],
        [3, 3.5, 0],
        [7, 4, 2],
    ], []);

    return (
        <group>
            {/* Pylons */}
            {[-6, 0, 7].map((x, i) => (
                <group key={i} position={[x, 0, i === 2 ? 2 : 0]}>
                    <mesh position={[0, 2, 0]}>
                        <cylinderGeometry args={[0.06, 0.08, 4]} />
                        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
                    </mesh>
                    <mesh position={[0, 4, 0]}>
                        <boxGeometry args={[1.2, 0.08, 0.08]} />
                        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
                    </mesh>
                </group>
            ))}
            {/* Wire using Drei Line */}
            <Line points={wirePoints} color="#94a3b8" lineWidth={1.5} />
        </group>
    );
}

// ── Grid Building (Load Consumer) ────────────────────────────
function LoadBuilding() {
    return (
        <group position={[8, 0, 0]}>
            <mesh position={[0, 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[3, 4, 3]} />
                <meshStandardMaterial color="#334155" metalness={0.3} roughness={0.7} />
            </mesh>
            {/* Windows */}
            {[[-0.8, 2.5], [0.8, 2.5], [-0.8, 1.2], [0.8, 1.2]].map(([x, y], i) => (
                <mesh key={i} position={[x, y, 1.51]}>
                    <planeGeometry args={[0.6, 0.5]} />
                    <meshStandardMaterial
                        color="#fbbf24"
                        emissive="#fbbf24"
                        emissiveIntensity={0.4}
                        transparent
                        opacity={0.7}
                    />
                </mesh>
            ))}
            <Text
                position={[0, 4.5, 0]}
                fontSize={0.3}
                color="#e2e8f0"
                anchorX="center"
                anchorY="bottom"
            >
                GRID NODE
            </Text>
        </group>
    );
}

// ── Energy Flow Paths ────────────────────────────────────────
// Define curved paths for energy particles
const FLOW_PATHS = {
    // Solar array center → BESS
    solarToBess: new CatmullRomCurve3([
        new Vector3(-6.5, 2.5, -2),
        new Vector3(-4, 3.5, -1),
        new Vector3(-2, 3, 0),
        new Vector3(0, 2, 0),
    ]),
    // Solar array center → Grid
    solarToGrid: new CatmullRomCurve3([
        new Vector3(-6.5, 2.5, -2),
        new Vector3(-3, 4, 0),
        new Vector3(2, 4.5, 0),
        new Vector3(6, 3.5, 1),
        new Vector3(8, 3, 0),
    ]),
    // BESS → Grid
    bessToGrid: new CatmullRomCurve3([
        new Vector3(0, 2, 0),
        new Vector3(2, 3, 0),
        new Vector3(5, 3.5, 0.5),
        new Vector3(8, 3, 0),
    ]),
    // Grid → BESS (charging from grid)
    gridToBess: new CatmullRomCurve3([
        new Vector3(8, 3, 0),
        new Vector3(5, 3.5, 0.5),
        new Vector3(2, 3, 0),
        new Vector3(0, 2, 0),
    ]),
};

// ── Energy Particle ──────────────────────────────────────────
interface EnergyParticleProps {
    curve: CatmullRomCurve3;
    color: Color;
    speed: number;
    offset: number;
    size: number;
    intensity: number;
}

function EnergyParticle({ curve, color, speed, offset, size, intensity }: EnergyParticleProps) {
    const meshRef = useRef<Mesh>(null);
    const progressRef = useRef((offset % 1));

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        
        progressRef.current = (progressRef.current + delta * speed) % 1;
        const point = curve.getPoint(progressRef.current);
        meshRef.current.position.copy(point);
        
        // Pulse effect
        const pulse = 0.8 + 0.4 * Math.sin(progressRef.current * Math.PI * 4);
        meshRef.current.scale.setScalar(size * pulse);
    });

    return (
        <mesh ref={meshRef}>
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
    const particleCount = active ? Math.max(3, Math.min(12, Math.ceil((powerMw / maxPowerMw) * 12))) : 0;
    const intensity = 0.5 + (powerMw / maxPowerMw) * 1.5;
    const baseSize = 0.08 + (powerMw / maxPowerMw) * 0.12;
    const speed = 0.3 + (powerMw / maxPowerMw) * 0.4;
    
    // Get points for the flow line
    const linePoints = useMemo(() => {
        return curve.getPoints(20).map(p => [p.x, p.y, p.z] as [number, number, number]);
    }, [curve]);

    if (!active || powerMw < 0.5) return null;

    return (
        <group>
            {/* Glowing path line */}
            <Line
                points={linePoints}
                color={color}
                lineWidth={1.5 + (powerMw / maxPowerMw) * 2}
                transparent
                opacity={0.3 + (powerMw / maxPowerMw) * 0.3}
            />
            {/* Energy particles */}
            {Array.from({ length: particleCount }).map((_, i) => (
                <EnergyParticle
                    key={i}
                    curve={curve}
                    color={color}
                    speed={speed}
                    offset={i / particleCount}
                    size={baseSize}
                    intensity={intensity}
                />
            ))}
        </group>
    );
}

// ── Energy Flow Controller ───────────────────────────────────
interface EnergyFlowSystemProps {
    solarExportMw: number;
    batteryChargeFromSolarMw: number;
    batteryChargeFromGridMw: number;
    batteryDischargeToGridMw: number;
    maxSolarMw: number;
    maxBessMw: number;
}

function EnergyFlowSystem({
    solarExportMw,
    batteryChargeFromSolarMw,
    batteryChargeFromGridMw,
    batteryDischargeToGridMw,
    maxSolarMw,
    maxBessMw,
}: EnergyFlowSystemProps) {
    return (
        <group>
            {/* Solar → BESS (charging from solar surplus) */}
            <EnergyFlow
                curve={FLOW_PATHS.solarToBess}
                color={COLOR_SOLAR_FLOW}
                powerMw={batteryChargeFromSolarMw}
                maxPowerMw={maxBessMw}
                active={batteryChargeFromSolarMw > 0.5}
            />
            
            {/* Solar → Grid (direct export) */}
            <EnergyFlow
                curve={FLOW_PATHS.solarToGrid}
                color={COLOR_SOLAR_FLOW}
                powerMw={solarExportMw}
                maxPowerMw={maxSolarMw}
                active={solarExportMw > 0.5}
            />
            
            {/* BESS → Grid (discharging) */}
            <EnergyFlow
                curve={FLOW_PATHS.bessToGrid}
                color={COLOR_DISCHARGE}
                powerMw={batteryDischargeToGridMw}
                maxPowerMw={maxBessMw}
                active={batteryDischargeToGridMw > 0.5}
            />
            
            {/* Grid → BESS (charging from grid) */}
            <EnergyFlow
                curve={FLOW_PATHS.gridToBess}
                color={COLOR_GRID_FLOW}
                powerMw={batteryChargeFromGridMw}
                maxPowerMw={maxBessMw}
                active={batteryChargeFromGridMw > 0.5}
            />
        </group>
    );
}

// ── Main Scene ───────────────────────────────────────────────
export function MicrogridScene({ gridState }: MicrogridSceneProps) {
    const {
        batteryMode,
        batterySocPercent,
        solarOutputMw,
        solarAcCapacityMw,
        timeOfDay,
        solarExportMw,
        batteryChargeFromSolarMw,
        batteryChargeFromGridMw,
        batteryDischargeToGridMw,
        batteryPowerRatingMw,
        gridBessConnectionMw,
    } = gridState;

    const sunPos = sunPosition(timeOfDay);
    const ambientIntensity = timeOfDay > 6 && timeOfDay < 19
        ? 0.4 + 0.5 * Math.sin(((timeOfDay - 6) / 12) * Math.PI)
        : 0.15;
    const sunIntensity = timeOfDay > 5.5 && timeOfDay < 19.5
        ? 2.0 * Math.sin(((timeOfDay - 5.5) / 14) * Math.PI)
        : 0.1;

    const maxBessMw = Math.min(batteryPowerRatingMw, gridBessConnectionMw);

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
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-far={200}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
            />
            <hemisphereLight
                ref={hemiRef}
                groundColor="#1a1a2e"
                intensity={0.35}
            />
            {/* Fill light so objects are always somewhat visible */}
            <pointLight position={[0, 10, 10]} intensity={0.5} color="#94a3b8" />

            {/* Fog */}
            <fog ref={fogRef} attach="fog" args={['#0a0a1a', 50, 150]} />

            {/* Ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial color="#111827" />
            </mesh>
            <Grid
                args={[100, 100]}
                position={[0, 0, 0]}
                cellSize={2}
                cellThickness={0.5}
                cellColor="#1e293b"
                sectionSize={10}
                sectionThickness={1}
                sectionColor="#334155"
                fadeDistance={60}
                fadeStrength={1}
                infiniteGrid
            />

            {/* Scene objects */}
            <BESSContainer mode={batteryMode} soc={batterySocPercent} />
            <SolarArray solarOutputMw={solarOutputMw} solarAcCapacityMw={solarAcCapacityMw} />
            <PowerLines />
            <LoadBuilding />

            {/* Energy flow animations */}
            <EnergyFlowSystem
                solarExportMw={solarExportMw}
                batteryChargeFromSolarMw={batteryChargeFromSolarMw}
                batteryChargeFromGridMw={batteryChargeFromGridMw}
                batteryDischargeToGridMw={batteryDischargeToGridMw}
                maxSolarMw={solarAcCapacityMw}
                maxBessMw={maxBessMw}
            />

            {/* Camera controls */}
            <OrbitControls
                enablePan
                enableZoom
                enableRotate
                minDistance={8}
                maxDistance={50}
                maxPolarAngle={Math.PI / 2.1}
                target={[0, 1.5, 0]}
            />
        </>
    );
}
