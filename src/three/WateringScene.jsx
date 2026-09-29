import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { StudioEnvironment } from './StudioEnvironment.jsx';
import { TreeStageSprite } from './TreeStageSprite.jsx';
import { GoldDust, ParticleBurst } from './GoldParticles.jsx';

const POUR_START_Y = 2.2;
const IMPACT_Y = -0.15;
const FALL_DISTANCE = POUR_START_Y - IMPACT_Y;
const DROP_Z = 0.35;
const DROP_DELAY = 0.18;
const DROP_DURATION = 0.85;
const SQUASH_DURATION = 0.16;
const SPLASH_LIFE = 0.55;

/**
 * Landing height per check-in day, tuned so the drop reads naturally
 * against the tree it is falling onto.
 *
 * - First check-in (stage 0): the default landing was below the pot, so
 *   it is raised 15% of the fall distance.
 * - Check-ins 4..7 (stages 3..6): the trees are progressively taller, so
 *   the drop lands 15% / 20% / 25% / 25% of the fall distance lower.
 */
function impactYForStage(stage) {
  if (stage <= 0) {
    return IMPACT_Y + FALL_DISTANCE * 0.15;
  }
  const lowerBy = { 3: 0.15, 4: 0.2, 5: 0.25, 6: 0.25 }[stage] ?? 0;
  return IMPACT_Y - FALL_DISTANCE * lowerBy;
}

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

/** Position of the drop at a given fall progress, with gravity ease-in. */
function dropYAt(progress, impactY) {
  const fall = progress * progress;
  return POUR_START_Y - fall * (POUR_START_Y - impactY);
}

/**
 * One beautiful drop: hangs for a beat, falls with gravity, wobbles
 * slightly like a real falling drop, leaves a soft golden shimmer trail,
 * and squashes when it lands on the soil.
 */
function SingleDrop({ pourStart, impactY, geometry, material, trailMaterial }) {
  const meshRef = useRef(null);
  const trailRefs = useRef([]);

  useFrame(() => {
    const elapsed = (performance.now() - pourStart.current) / 1000 - DROP_DELAY;

    if (meshRef.current) {
      if (elapsed < 0) {
        // Waiting to fall: shimmer at the top.
        const shimmer = Math.sin(performance.now() / 90) * 0.02;
        meshRef.current.visible = true;
        meshRef.current.position.set(0, POUR_START_Y + shimmer, DROP_Z);
        meshRef.current.rotation.z = 0;
        meshRef.current.scale.setScalar(1);
      } else if (elapsed < DROP_DURATION) {
        const progress = elapsed / DROP_DURATION;
        meshRef.current.visible = true;
        meshRef.current.position.set(
          Math.sin(elapsed * 20) * 0.006,
          dropYAt(progress, impactY),
          DROP_Z,
        );
        meshRef.current.rotation.z = Math.sin(elapsed * 26) * 0.04;
        meshRef.current.scale.setScalar(1);
      } else if (elapsed < DROP_DURATION + SQUASH_DURATION) {
        // Landing squash before vanishing into the splash.
        const p = (elapsed - DROP_DURATION) / SQUASH_DURATION;
        meshRef.current.visible = true;
        meshRef.current.position.set(0, impactY, DROP_Z);
        meshRef.current.rotation.z = 0;
        meshRef.current.scale.set(1 + 0.5 * p, 1 - 0.55 * p, 1 + 0.5 * p);
      } else {
        meshRef.current.visible = false;
      }
    }

    for (let i = 0; i < trailRefs.current.length; i += 1) {
      const trail = trailRefs.current[i];
      if (!trail) {
        continue;
      }
      const lag = 0.06 + i * 0.055;
      const trailElapsed = elapsed - lag;
      if (trailElapsed >= 0 && trailElapsed < DROP_DURATION) {
        const progress = trailElapsed / DROP_DURATION;
        trail.visible = true;
        trail.position.set(
          Math.sin(trailElapsed * 20) * 0.006,
          dropYAt(progress, impactY),
          DROP_Z - 0.02,
        );
        const fade = 1 - progress;
        trail.material.opacity = fade * (0.34 - i * 0.08);
        trail.scale.setScalar(0.85 - i * 0.18);
      } else {
        trail.visible = false;
      }
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={material} visible={false} />
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          ref={(node) => {
            trailRefs.current[index] = node;
          }}
          geometry={geometry}
          material={trailMaterial}
          visible={false}
        />
      ))}
    </group>
  );
}

/**
 * The single landing splash: micro-teardrops kicked outward and a thin
 * gold ring expanding across the soil, both fading out fast.
 */
function ImpactSplash({ hit, impactY, geometry, material }) {
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

    const splashlets = [
      { vx: 0.42, vy: 0.62, scale: 0.34, tilt: -0.5 },
      { vx: -0.36, vy: 0.74, scale: 0.28, tilt: 0.55 },
      { vx: 0.12, vy: 0.92, scale: 0.24, tilt: 0.1 },
      { vx: -0.06, vy: 0.5, scale: 0.4, tilt: -0.15 },
    ];

    for (let i = 0; i < splashlets.length; i += 1) {
      const mesh = splashRefs.current[i];
      if (!mesh) {
        continue;
      }
      mesh.visible = active;
      if (active) {
        const { vx, vy, scale, tilt } = splashlets[i];
        mesh.position.set(vx * p, impactY + vy * p - 3.2 * p * p, DROP_Z);
        mesh.rotation.z = tilt + tilt * p;
        mesh.scale.setScalar(scale * (1 - p));
      }
    }

    if (ringRef.current) {
      ringRef.current.visible = active;
      if (active) {
        const ringScale = 0.2 + 1.15 * p;
        ringRef.current.scale.set(ringScale, ringScale, ringScale);
        ringRef.current.material.opacity = 0.5 * (1 - p);
      }
    }
  });

  return (
    <group>
      {[0, 1, 2, 3].map((index) => (
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
      <mesh ref={ringRef} position={[0, impactY, DROP_Z - 0.02]} rotation-x={-Math.PI / 2} visible={false}>
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
 * The full watering reaction: one beautiful teardrop falls onto the
 * soil while the camera pushes toward the pot, then the tree grows from
 * `fromStage` to `toStage` (video playback inside TreeStageSprite — the
 * check-in cutscene) under a gold light wash, with a landing splash and
 * a soil ripple — all real 3D motion driven by `phase`.
 */
export function WateringScene({ fromStage, toStage, phase, reducedMotion }) {
  const [growthStage, setGrowthStage] = useState(fromStage);
  const [impacted, setImpacted] = useState(false);
  const pourStartRef = useRef(performance.now());

  const impactY = impactYForStage(fromStage);

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
      // Opalescent water: strong clearcoat + specular so the drop glints
      // like water against the dark scene, with a faint inner glow so
      // the shape always reads.
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
  const trailMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: '#ffe9b8',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    [],
  );

  useEffect(() => () => {
    teardropMaterial.dispose();
    trailMaterial.dispose();
    teardropGeometry.dispose();
  }, [teardropMaterial, trailMaterial, teardropGeometry]);

  // Fire the splash once the drop has landed.
  useFrame(() => {
    const elapsed = (performance.now() - pourStartRef.current) / 1000 - DROP_DELAY;
    const landed = elapsed >= DROP_DURATION;
    if (landed !== impacted && phase !== 'result') {
      setImpacted(landed);
    }
  });

  const pouring = phase === 'pouring' || phase === 'settling';

  return (
    <>
      <StudioEnvironment />
      <TreeStageSprite stage={growthStage} waterPulse={1} reducedMotion={reducedMotion} />
      <GoldDust count={36} reducedMotion={reducedMotion} />

      {!reducedMotion && pouring ? (
        <SingleDrop
          pourStart={pourStartRef}
          impactY={impactY}
          geometry={teardropGeometry}
          material={teardropMaterial}
          trailMaterial={trailMaterial}
        />
      ) : null}

      {!reducedMotion ? (
        <ImpactSplash hit={impacted} impactY={impactY} geometry={teardropGeometry} material={teardropMaterial} />
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
