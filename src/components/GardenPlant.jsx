import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { TreeStageSprite } from '../three/TreeStageSprite.jsx';
import { StudioEnvironment } from '../three/StudioEnvironment.jsx';
import { ParallaxGroup, RitualCamera, usePointerParallax } from '../three/CameraRig.jsx';
import { GoldDust, OrbitGlow } from '../three/GoldParticles.jsx';

/**
 * The garden tree stage: the growth video (TreeStageSprite → tree07.mp4,
 * day N = second N) inside a living scene — idle camera drift with a
 * settle shake on each new day, cursor parallax, ambient golden dust,
 * orbiting glow motes on the final form, and a bloom/vignette grade.
 * All motion respects reducedMotion.
 */
export function GardenPlant({ stage, reducedMotion = false }) {
  const isFinalForm = stage >= 7;
  const isLateStage = stage >= 5;
  const { pointerRef, handleMove, handleLeave } = usePointerParallax();

  return (
    <div
      className={`garden-plant${isFinalForm ? ' is-final-form' : ''}${isLateStage ? ' is-late-stage' : ''}`}
      aria-hidden="true"
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.5, 5.8], fov: 38 }}
        gl={{ alpha: false, antialias: true }}
      >
        <RitualCamera shakeKey={stage} reducedMotion={reducedMotion} />
        <StudioEnvironment />

        <ParallaxGroup pointerRef={pointerRef} reducedMotion={reducedMotion}>
          <TreeStageSprite stage={stage} reducedMotion={reducedMotion} />
          {isFinalForm ? (
            <group position={[0, 1.05, 0.15]}>
              <OrbitGlow reducedMotion={reducedMotion} />
            </group>
          ) : null}
        </ParallaxGroup>

        <ParallaxGroup pointerRef={pointerRef} multiplier={1.7} reducedMotion={reducedMotion}>
          <GoldDust reducedMotion={reducedMotion} />
        </ParallaxGroup>

        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.62} luminanceSmoothing={0.2} radius={0.65} />
          <Vignette eskil={false} offset={0.22} darkness={0.58} />
          <ToneMapping mode={ToneMappingMode.LINEAR} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
