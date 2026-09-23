import { useEffect, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GrowthVideo } from './GrowthVideo.jsx';
import { ParticleBurst } from './GoldParticles.jsx';

const MAX_STAGE = 7;
const GROW_DURATION = 0.7;

const STAGE_TEXTURE_URLS = Array.from({ length: MAX_STAGE + 1 }, (_, index) => `/tree/${index}.png`);

function clampStage(value) {
  return THREE.MathUtils.clamp(value, 0, MAX_STAGE);
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * The garden tree. If a growth video exists (`public/tree/growth.mp4`,
 * see GrowthVideo) it is preferred; otherwise the eight daily stage
 * images are used with a game-style growth burst — the new stage snaps
 * in and springs up from the pot with an overshoot ease, masked by a
 * ring of gold sparks and a light flash. No crossfading, no pixel
 * morphing: nothing can warp.
 */
export function TreeStageSprite(props) {
  const [videoFailed, setVideoFailed] = useState(false);

  if (videoFailed) {
    return <GrowthStageSprite {...props} />;
  }

  return <GrowthVideo {...props} onError={() => setVideoFailed(true)} />;
}

/**
 * Image-stage tree with the growth burst animation. The plane is pivoted
 * at the pot so scaling reads as the tree growing out of its pot, and a
 * stage change re-fires the spark ring at the pot.
 */
function GrowthStageSprite({ stage = 0, waterPulse = 0, reducedMotion = false, celebrate = true }) {
  const textures = useLoader(THREE.TextureLoader, STAGE_TEXTURE_URLS);

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
  }, [textures]);

  const groupRef = useRef(null);
  const innerRef = useRef(null);
  const meshRef = useRef(null);
  const glowMaterialRef = useRef(null);
  const pulseStartRef = useRef(-Infinity);
  const growStartRef = useRef(-Infinity);
  const displayStageRef = useRef(clampStage(stage));
  const mountedRef = useRef(false);

  const viewport = useThree((state) => state.viewport);
  const planeSize = Math.min(viewport.width, viewport.height) * 0.97;
  const potOffset = -planeSize * 0.33;

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    displayStageRef.current = clampStage(stage);
    if (celebrate) {
      growStartRef.current = performance.now();
    }
  }, [stage, celebrate]);

  useEffect(() => {
    if (waterPulse) {
      pulseStartRef.current = performance.now();
    }
  }, [waterPulse]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (groupRef.current) {
      groupRef.current.position.y = reducedMotion ? 0 : Math.sin(time * 0.5) * 0.03;
    }

    if (innerRef.current) {
      const elapsed = (performance.now() - growStartRef.current) / 1000;
      let scaleFactor = 1;

      if (!reducedMotion && elapsed >= 0 && elapsed < GROW_DURATION) {
        const t = THREE.MathUtils.clamp(elapsed / GROW_DURATION, 0, 1);
        scaleFactor = 0.82 + 0.18 * easeOutBack(t);
      }

      innerRef.current.scale.setScalar(scaleFactor);
    }

    if (meshRef.current) {
      meshRef.current.material.map = textures[displayStageRef.current];
    }

    if (glowMaterialRef.current) {
      const pulseDuration = reducedMotion ? 0.6 : 1.8;
      const elapsed = (performance.now() - pulseStartRef.current) / 1000;
      const wave = elapsed >= 0 && elapsed < pulseDuration
        ? Math.max(0, Math.sin((elapsed / pulseDuration) * Math.PI))
        : 0;
      glowMaterialRef.current.opacity = wave * 0.28;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Pivot at the pot so growth scales the tree up from its base */}
      <group ref={innerRef} position={[0, potOffset, 0]}>
        <mesh ref={meshRef} position={[0, -potOffset, 0]} scale={planeSize}>
          <planeGeometry />
          <meshBasicMaterial map={textures[0]} toneMapped={false} />
        </mesh>
      </group>

      <ParticleBurst
        trigger={celebrate ? stage : 0}
        position={[0, potOffset, 0.3]}
        count={22}
        mode="ring"
        reducedMotion={reducedMotion}
      />

      {/* Additive gold wash shown only while the water pulse is active */}
      <mesh position={[0, 0, 0.004]} scale={planeSize}>
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#ffdf9e"
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
