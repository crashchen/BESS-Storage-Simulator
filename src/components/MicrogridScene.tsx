// ============================================================
// @Agent-3D (Spatial Architect) — MicrogridScene
// 3D rendering of the BESS container, solar array, and
// dynamic time-of-day lighting. Subscribes to GridState.
// ============================================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Line } from '@react-three/drei';
import { BackSide, Color, type Mesh, type MeshStandardMaterial } from 'three';
import type { MicrogridSceneProps } from '../types';

// ── Color palette ────────────────────────────────────────────
const COLOR_CHARGE = new Color('#22c55e');
const COLOR_DISCHARGE = new Color('#f59e0b');
const COLOR_IDLE = new Color('#64748b');
const COLOR_SOLAR_ON = new Color('#facc15');
const COLOR_SOLAR_OFF = new Color('#1e293b');

// ── Helper: Sun position from timeOfDay ──────────────────────
function sunPosition(tod: number): [number, number, number] {
    const angle = ((tod - 6) / 12) * Math.PI; // 6AM=0, 18PM=π
    const x = Math.cos(angle) * 80;
    const y = Math.sin(angle) * 80;
    const z = 30;
    return [x, Math.max(y, -10), z];
}

function skyColor(tod: number): Color {
    if (tod < 5 || tod > 20) return new Color('#0a0a1a');
    if (tod < 7) return new Color('#1a1a3e').lerp(new Color('#4a6fa5'), (tod - 5) / 2);
    if (tod > 18) return new Color('#4a6fa5').lerp(new Color('#1a1a3e'), (tod - 18) / 2);
    return new Color('#87CEEB').lerp(new Color('#4a9edb'), Math.abs(tod - 12) / 6);
}

// ── BESS Container ───────────────────────────────────────────
function BESSContainer({ mode, soc }: { mode: string; soc: number }) {
    const meshRef = useRef<Mesh>(null);
    const glowRef = useRef<Mesh>(null);

    const targetColor = mode === 'charging' ? COLOR_CHARGE : mode === 'discharging' ? COLOR_DISCHARGE : COLOR_IDLE;
    const levelColor = targetColor;
    const currentColor = useRef(targetColor.clone());

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

            {/* SoC level indicator bar */}
            <mesh position={[0, -1.5 + (soc / 100) * 1.5, 1.01]}>
                <planeGeometry args={[3.6, (soc / 100) * 2.8]} />
                <meshStandardMaterial
                    color={levelColor}
                    emissive={levelColor}
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.6}
                />
            </mesh>

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
function SolarPanel({ position, solarKw }: { position: [number, number, number]; solarKw: number }) {
    const brightness = solarKw / 85; // normalized

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
                    color={COLOR_SOLAR_OFF.clone().lerp(COLOR_SOLAR_ON, brightness)}
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
function SolarArray({ solarKw }: { solarKw: number }) {
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
                <SolarPanel key={i} position={pos} solarKw={solarKw} />
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
                LOAD CENTER
            </Text>
        </group>
    );
}

// ── Main Scene ───────────────────────────────────────────────
export function MicrogridScene({ gridState }: MicrogridSceneProps) {
    const { batteryMode, batterySocPercent, solarOutputKw, timeOfDay } = gridState;

    const sunPos = sunPosition(timeOfDay);
    const sky = skyColor(timeOfDay);
    const ambientIntensity = timeOfDay > 6 && timeOfDay < 19
        ? 0.4 + 0.5 * Math.sin(((timeOfDay - 6) / 12) * Math.PI)
        : 0.15;
    const sunIntensity = timeOfDay > 5.5 && timeOfDay < 19.5
        ? 2.0 * Math.sin(((timeOfDay - 5.5) / 14) * Math.PI)
        : 0.1;

    return (
        <>
            {/* Lighting — boosted for visibility */}
            <ambientLight intensity={ambientIntensity} color={sky} />
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
                color={sky}
                groundColor="#1a1a2e"
                intensity={0.35}
            />
            {/* Fill light so objects are always somewhat visible */}
            <pointLight position={[0, 10, 10]} intensity={0.5} color="#94a3b8" />

            {/* Fog */}
            <fog attach="fog" args={[sky, 50, 150]} />

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
            <SolarArray solarKw={solarOutputKw} />
            <PowerLines />
            <LoadBuilding />

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
