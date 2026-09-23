import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const BURST_LIFE_RING = 0.8;
const BURST_LIFE_FOUNTAIN = 1.3;

function makePositions(count, spread) {
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    array[i * 3] = (Math.random() - 0.5) * spread.x;
    array[i * 3 + 1] = spread.minY + Math.random() * (spread.maxY - spread.minY);
    array[i * 3 + 2] = spread.minZ + Math.random() * (spread.maxZ - spread.minZ);
  }
  return array;
}

/**
 * Configurable gold particle burst fired every time `trigger` changes.
 * Two modes: 'ring' — a flat ring of sparks exploding outward from the
 * pot when the tree grows; 'fountain' — a cone of sparks kicked upward
 * when water lands on the soil. Each fire re-seeds velocities and
 * displacement, and the geometry keeps its own copy of the base
 * positions so the template array is never mutated.
 */
export function ParticleBurst({
  trigger = 0,
  position = [0, -1, 0.3],
  count = 24,
  mode = 'ring',
  reducedMotion = false,
}) {
  const pointsRef = useRef(null);
  const startRef = useRef(-Infinity);
  const displacementRef = useRef(null);
  const velocitiesRef = useRef(null);
  const firstRunRef = useRef(true);
  const life = mode === 'ring' ? BURST_LIFE_RING : BURST_LIFE_FOUNTAIN;
  const gravity = mode === 'ring' ? -1.6 : -2.2;

  const basePositions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 0.16;
      array[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      array[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
    }
    return array;
  }, [count]);

  const geometry = useMemo(() => {
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(basePositions), 3));
    return bufferGeometry;
  }, [basePositions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }

    if (!reducedMotion) {
      startRef.current = performance.now();
      displacementRef.current = new Float32Array(count * 3);

      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        if (mode === 'ring') {
          const angle = (i / count) * Math.PI * 2;
          velocities[i * 3] = Math.cos(angle) * (0.9 + Math.random() * 0.5);
          velocities[i * 3 + 1] = 0.35 + Math.random() * 0.55;
          velocities[i * 3 + 2] = Math.sin(angle) * (0.55 + Math.random() * 0.3);
        } else {
          velocities[i * 3] = (Math.random() - 0.5) * 1.1;
          velocities[i * 3 + 1] = 0.9 + Math.random() * 1.3;
          velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        }
      }
      velocitiesRef.current = velocities;

      geometry.attributes.position.array.set(basePositions);
      geometry.attributes.position.needsUpdate = true;
    }
  }, [trigger, count, mode, reducedMotion, basePositions, geometry]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) {
      return;
    }

    const elapsed = (performance.now() - startRef.current) / 1000;
    const visible = !reducedMotion && elapsed >= 0 && elapsed < life;
    points.visible = visible;

    if (!visible || !displacementRef.current || !velocitiesRef.current) {
      return;
    }

    const step = Math.min(delta, 0.05);
    const displacement = displacementRef.current;
    const velocities = velocitiesRef.current;
    const attribute = points.geometry.attributes.position;

    for (let i = 0; i < count; i += 1) {
      velocities[i * 3 + 1] += gravity * step;
      displacement[i * 3] += velocities[i * 3] * step;
      displacement[i * 3 + 1] += velocities[i * 3 + 1] * step;
      displacement[i * 3 + 2] += velocities[i * 3 + 2] * step;

      attribute.array[i * 3] = basePositions[i * 3] + displacement[i * 3];
      attribute.array[i * 3 + 1] = basePositions[i * 3 + 1] + displacement[i * 3 + 1];
      attribute.array[i * 3 + 2] = basePositions[i * 3 + 2] + displacement[i * 3 + 2];
    }

    attribute.needsUpdate = true;
    points.material.opacity = Math.max(0, 1 - elapsed / life) * 0.95;
  });

  return (
    <points ref={pointsRef} geometry={geometry} position={position} visible={false}>
      <pointsMaterial
        color="#ffe9a8"
        size={mode === 'ring' ? 0.055 : 0.05}
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/**
 * Ambient golden dust drifting around the tree — a slowly rotating cloud
 * with a gentle bob and a material twinkle. Static under reduced motion.
 */
export function GoldDust({ count = 42, reducedMotion = false }) {
  const groupRef = useRef(null);
  const materialRef = useRef(null);

  const positions = useMemo(() => makePositions(count, {
    x: 3.0,
    minY: -1.35,
    maxY: 1.7,
    minZ: -0.45,
    maxZ: 0.6,
  }), [count]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    if (reducedMotion) {
      groupRef.current.rotation.y = 0;
      groupRef.current.position.y = 0;
      if (materialRef.current) {
        materialRef.current.opacity = 0.45;
      }
      return;
    }

    const time = state.clock.getElapsedTime();
    groupRef.current.rotation.y = time * 0.06;
    groupRef.current.position.y = Math.sin(time * 0.6) * 0.06;
    if (materialRef.current) {
      materialRef.current.opacity = 0.4 + Math.sin(time * 1.7) * 0.22;
    }
  });

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          color="#e9c47d"
          size={0.035}
          transparent
          opacity={0.5}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/**
 * Slow golden orbiters circling the final-form canopy (day 7), like
 * motes of light caught in the tree's glow.
 */
export function OrbitGlow({ reducedMotion = false, count = 12 }) {
  const groupRef = useRef(null);

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.5 + (i % 3) * 0.16;
      array[i * 3] = Math.cos(angle) * radius;
      array[i * 3 + 1] = 0.62 + Math.sin(angle * 2) * 0.12;
      array[i * 3 + 2] = 0.28 + Math.sin(angle) * radius * 0.25;
    }
    return array;
  }, [count]);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    if (reducedMotion) {
      groupRef.current.rotation.y = 0;
      return;
    }

    groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.22;
  });

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffe9a8"
          size={0.05}
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
