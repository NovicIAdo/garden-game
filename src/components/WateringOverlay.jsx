import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { WateringScene } from '../three/WateringScene.jsx';
import { RitualCamera } from '../three/CameraRig.jsx';

const FOCUS_BY_PHASE = { pouring: 0.55, settling: 1, result: 0.25 };

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
