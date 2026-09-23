import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { StudioEnvironment } from './StudioEnvironment.jsx';
import { TreeStageSprite } from './TreeStageSprite.jsx';
import { GoldDust, ParticleBurst } from './GoldParticles.jsx';

function WaterDroplet({ active, reducedMotion }) {
  const ref = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (active) {
      startRef.current = performance.now();
    }
  }, [active]);

  useFrame(() => {
    if (!ref.current) {
      return;
    }

    const duration = reducedMotion ? 0.5 : 1.1;
    const elapsed = active ? (performance.now() - startRef.current) / 1000 : duration;
    const progress = Math.min(1, elapsed / duration);

    ref.current.visible = active && progress < 1;
    ref.current.position.y = 2.2 - progress * 2.35;
    ref.current.material.opacity = active ? Math.min(1, 1 - progress + 0.3) : 0;
  });

  return (
    <mesh ref={ref} position={[0, 2.2, 0.35]} visible={false}>
      <sphereGeometry args={[0.09, 16, 16]} />
      <meshPhysicalMaterial
        color="#f3e2b8"
        transparent
        opacity={0}
        metalness={0.2}
        roughness={0.05}
        transmission={0.4}
        thickness={0.2}
      />
    </mesh>
  );
}

/**
 * The full watering reaction: the camera pushes toward the pot while
 * water falls, the tree grows from `fromStage` to `toStage` (video
 * playback inside TreeStageSprite — the check-in cutscene) under a gold
 * light wash, and a fountain of gold sparks kicks up from the soil — all
 * real 3D motion driven by `phase`.
 */
export function WateringScene({ fromStage, toStage, phase, reducedMotion }) {
  const [growthStage, setGrowthStage] = useState(fromStage);

  useEffect(() => {
    if (phase === 'settling' || phase === 'result') {
      setGrowthStage(toStage);
    }
  }, [phase, toStage]);

  return (
    <>
      <StudioEnvironment />
      <TreeStageSprite stage={growthStage} waterPulse={1} reducedMotion={reducedMotion} />
      <GoldDust count={36} reducedMotion={reducedMotion} />
      <WaterDroplet active={phase === 'pouring'} reducedMotion={reducedMotion} />
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
