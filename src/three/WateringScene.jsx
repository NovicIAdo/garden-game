import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { StudioEnvironment } from './StudioEnvironment.jsx';
import { TreeStageSprite } from './TreeStageSprite.jsx';
import { GoldDust, ParticleBurst } from './GoldParticles.jsx';

const POUR_START_Y = 2.2;
const IMPACT_Y = -0.15;
const DROP_Z = 0.35;
const SPLASH_LIFE = 0.5;

/**
 * A water drop as a proper teardrop: a spherical bulb at the bottom that
 * tapers to a point at the top, built as a lathe profile (bottom arc +
 * a quadratic-bezier taper) instead of a sphere.
 */
function createTeardropGeometry(bulbRadius = 0.06, tipHeight = 0.17) {
  const points = [];
  const arcSteps = 8;

  // Bottom bulb: arc from the underside (0, -bulb) up to the equator (bulb, 0).
  for (let i = 0; i <= arcSteps; i += 1) {
    const angle = -Math.PI / 2 + (i / arcSteps) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.cos(angle) * bulbRadius, Math.sin(angle) * bulbRadius));
  }

  // Taper to the tip: quadratic bezier from (bulb, 0) to (0, tipHeight).
  const control = new THREE.Vector2(bulbRadius * 0.52, tipHeight * 0.42);
  const bezierSteps = 8;
  for (let i = 1; i <= bezierSteps; i += 1) {
    const t = i / bezierSteps;
    const u = 1 - t;
    points.push(new THREE.Vector2(
      u * u * bulbRadius + 2 * u * t * control.x,
      2 * u * t * control.y + t * t * tipHeight,
    ));
  }

  const geometry = new THREE.LatheGeometry(points, 28);
  geometry.computeVertexNormals();
  return geometry;
}

const DROPS = [
  { delay: 0.08, x: -0.18, scale: 1.0, tilt: -0.05, duration: 0.6 },
  { delay: 0.38, x: 0.13, scale: 0.8, tilt: 0.06, duration: 0.55 },
  { delay: 0.68, x: -0.04, scale: 1.1, tilt: -0.02, duration: 0.52 },
  { delay: 0.95, x: 0.19, scale: 0.7, tilt: 0.08, duration: 0.5 },
];

const SPLASHETS = [
  { vx: 0.5, vy: 0.62, scale: 0.34, tilt: -0.5 },
  { vx: -0.42, vy: 0.74, scale: 0.28, tilt: 0.55 },
  { vx: 0.14, vy: 0.9, scale: 0.24, tilt: 0.1 },
  { vx: -0.06, vy: 0.5, scale: 0.4, tilt: -0.15 },
];

/**
 * One falling teardrop. Gravity eases it in (quadratic fall), with a tiny
 * lateral sway so the stream feels alive; it disappears at the soil.
 */
function WaterDrop({ pourStart, delay, x, scale, tilt, duration, geometry, material }) {
  const meshRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current) {
      return;
    }

    const elapsed = (performance.now() - pourStart.current) / 1000 - delay;
    const progress = Math.min(1, Math.max(0, elapsed / duration));

    if (progress >= 1) {
      meshRef.current.visible = false;
      return;
    }

    meshRef.current.visible = true;
    const fall = progress * progress;
    meshRef.current.position.set(
      x + Math.sin(elapsed * 22) * 0.008,
      POUR_START_Y - fall * (POUR_START_Y - IMPACT_Y),
      DROP_Z,
    );
    meshRef.current.rotation.z = tilt;
    meshRef.current.scale.setScalar(scale);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} visible={false} />;
}

/**
 * The splash at one drop impact: a few micro-teardrops kicked outward and
 * a thin gold ring expanding across the soil, both fading out fast.
 */
function ImpactSplash({ hit, x, geometry, material }) {
  const startRef = useRef(-Infinity);
  const splashRefs = useRef([]);
  const ringRef = useRef(null);

  useEffect(() => {
    if (hit) {
      startRef.current = performance.now();
    }
  }, [hit]);

  useFrame(() => {
    const elapsed = (performance.now() - startRef.current) / 1000;
    const active = elapsed >= 0 && elapsed < SPLASH_LIFE;
    const p = Math.min(1, Math.max(0, elapsed / SPLASH_LIFE));

    for (let i = 0; i < SPLASHETS.length; i += 1) {
      const mesh = splashRefs.current[i];
      if (!mesh) {
        continue;
      }
      mesh.visible = active;
      if (active) {
        const { vx, vy, scale, tilt } = SPLASHETS[i];
        mesh.position.set(x + vx * p, IMPACT_Y + vy * p - 3.2 * p * p, DROP_Z);
        mesh.rotation.z = tilt + tilt * p;
        mesh.scale.setScalar(scale * (1 - p));
      }
    }

    if (ringRef.current) {
      ringRef.current.visible = active;
      if (active) {
        const ringScale = 0.18 + 1.05 * p;
        ringRef.current.scale.set(ringScale, ringScale, ringScale);
        ringRef.current.material.opacity = 0.5 * (1 - p);
      }
    }
  });

  return (
    <group>
      {SPLASHETS.map((_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            splashRefs.current[index] = node;
          }}
          geometry={geometry}
          material={material}
          visible={false}
        />
      ))}
      <mesh ref={ringRef} position={[x, IMPACT_Y, DROP_Z - 0.02]} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.75, 0.95, 28]} />
        <meshBasicMaterial
          color="#ffdf9e"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * The pouring stream: a staggered line of teardrops raining onto the
 * soil, each with its own splash and ripple on impact.
 */
function WaterPour({ pourStart, geometry, material }) {
  const [, force] = useState(0);
  const impactsRef = useRef(DROPS.map(() => false));

  useFrame(() => {
    const elapsed = (performance.now() - pourStart.current) / 1000;
    let changed = false;
    DROPS.forEach((drop, index) => {
      const landed = elapsed >= drop.delay + drop.duration;
      if (landed !== impactsRef.current[index]) {
        impactsRef.current[index] = landed;
        changed = true;
      }
    });
    if (changed) {
      force((value) => value + 1);
    }
  });

  return (
    <group>
      {DROPS.map((drop, index) => (
        <group key={index}>
          <WaterDrop
            pourStart={pourStart}
            delay={drop.delay}
            x={drop.x}
            scale={drop.scale}
            tilt={drop.tilt}
            duration={drop.duration}
            geometry={geometry}
            material={material}
          />
          <ImpactSplash hit={impactsRef.current[index]} x={drop.x} geometry={geometry} material={material} />
        </group>
      ))}
    </group>
  );
}

/**
 * The full watering reaction: teardrops rain onto the soil while the
 * camera pushes toward the pot, the tree grows from `fromStage` to
 * `toStage` (video playback inside TreeStageSprite — the check-in
 * cutscene) under a gold light wash, and each drop's impact kicks up a
 * micro-splash and a soil ripple — all real 3D motion driven by `phase`.
 */
export function WateringScene({ fromStage, toStage, phase, reducedMotion }) {
  const [growthStage, setGrowthStage] = useState(fromStage);
  const pourStartRef = useRef(performance.now());

  useEffect(() => {
    if (phase === 'settling' || phase === 'result') {
      setGrowthStage(toStage);
    }
  }, [phase, toStage]);

  useEffect(() => {
    if (phase === 'pouring') {
      pourStartRef.current = performance.now();
    }
  }, [phase]);

  const teardropGeometry = useMemo(() => createTeardropGeometry(), []);
  const teardropMaterial = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      // Opalescent water: no transmission (transmissive passes render
      // unreliably on some GPUs / software WebGL), strong clearcoat +
      // specular so the drop glints like water against the dark scene.
      color: '#eef3f7',
      roughness: 0.05,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
      emissive: '#9db4c8',
      emissiveIntensity: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      specularIntensity: 1.5,
      envMapIntensity: 1.8,
    }),
    [],
  );

  useEffect(() => () => {
    teardropMaterial.dispose();
    teardropGeometry.dispose();
  }, [teardropMaterial, teardropGeometry]);

  const pouring = phase === 'pouring' || phase === 'settling';

  return (
    <>
      <StudioEnvironment />
      <TreeStageSprite stage={growthStage} waterPulse={1} reducedMotion={reducedMotion} />
      <GoldDust count={36} reducedMotion={reducedMotion} />

      {!reducedMotion && pouring ? (
        <WaterPour pourStart={pourStartRef} geometry={teardropGeometry} material={teardropMaterial} />
      ) : null}

      <ParticleBurst
        trigger={phase === 'settling' ? 1 : 0}
        position={[0, -0.12, 0.35]}
        count={36}
        mode="fountain"
        reducedMotion={reducedMotion}
      />
    </>
  );
}
