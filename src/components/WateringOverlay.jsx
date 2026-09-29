import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { WateringScene } from '../three/WateringScene.jsx';
import { RitualCamera } from '../three/CameraRig.jsx';

const FOCUS_BY_PHASE = { pouring: 0.55, settling: 1, result: 0.25 };

/**
 * Guards the watering canvas against a @react-three/postprocessing quirk:
 * the library shares one module-level Vector2 (`glSize`) across every
 * EffectComposer on the page, so the garden's composer can write its own
 * 250x260 size into it right before this overlay's composer mounts — and
 * this overlay's composer then re-sizes the watering renderer to the
 * garden's size, drawing the whole scene off-center on mobile. The store
 * size is correct; this just re-asserts the real container size right
 * after mount (and once more shortly after) so the composer converges.
 */
function OverlaySizeGuard() {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const assertSize = () => {
      const container = gl.domElement.closest?.('.watering-canvas');
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const current = gl.getSize(new THREE.Vector2());
      if (current.width !== width || current.height !== height) {
        gl.setSize(width, height, true);
      }
    };

    assertSize();
    const retry = window.setTimeout(assertSize, 120);
    return () => window.clearTimeout(retry);
  }, [gl]);

  return null;
}

export function WateringOverlay({ onComplete, reducedMotion, fromStage = 0, toStage = 1 }) {
  const [phase, setPhase] = useState(reducedMotion ? 'result' : 'pouring');

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const timers = [
      setTimeout(() => setPhase('settling'), 1200),
      setTimeout(() => setPhase('result'), 2600),
    ];

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion]);

  const focus = FOCUS_BY_PHASE[phase] ?? 0;

  return (
    <div className="watering-overlay" role="status" aria-live="polite">
      <div className="watering-sweep" aria-hidden="true" />

      <button type="button" className="overlay-skip" onClick={onComplete}>
        Skip
      </button>

      <div className={`watering-canvas${toStage >= 7 && phase === 'result' ? ' is-final-dream' : ''}`} aria-hidden="true">
        <Canvas
          dpr={[1, 2]}
          resize={{ offsetSize: true }}
          camera={{ position: [0, 0.5, 5.8], fov: 38 }}
          gl={{ alpha: false, antialias: true }}
        >
          <RitualCamera focus={focus} reducedMotion={reducedMotion} />
          <WateringScene fromStage={fromStage} toStage={toStage} phase={phase} reducedMotion={reducedMotion} />

          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.62} luminanceSmoothing={0.2} radius={0.65} />
            <Vignette eskil={false} offset={0.22} darkness={0.58} />
            <ToneMapping mode={ToneMappingMode.LINEAR} />
          </EffectComposer>

          <OverlaySizeGuard />
        </Canvas>
      </div>

      {phase === 'result' ? (
        <div className="watering-result">
          <p className="result-title">The garden remembers.</p>
          <p className="result-caption">Growth stage {String(toStage).padStart(2, '0')} received</p>
          <button type="button" className="primary-button" onClick={onComplete}>
            Continue
          </button>
        </div>
      ) : null}
    </div>
  );
}
