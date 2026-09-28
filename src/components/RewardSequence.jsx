import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { playCoinChime, playRewardFanfare } from '../garden/sound-engine.js';
import { RewardCoinsScene } from '../three/RewardCoinsScene.jsx';
import { SparklesIcon } from './icons.jsx';

const REVEAL_STEP_MS = 220;
const TOTAL_COINS = 10;

export function RewardSequence({ onClose, balance, streak, week, soundOn, reducedMotion }) {
  const [visibleCoins, setVisibleCoins] = useState(reducedMotion ? TOTAL_COINS : 0);
  const [phase, setPhase] = useState(reducedMotion ? 'claimed' : 'intro');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    playRewardFanfare(soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (reducedMotion || phase !== 'intro') {
      return;
    }

    const introTimer = setTimeout(() => setPhase('coins'), 900);
    return () => clearTimeout(introTimer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase !== 'coins' || reducedMotion) {
      return;
    }

    if (visibleCoins >= TOTAL_COINS) {
      const claimedTimer = setTimeout(() => setPhase('claimed'), 500);
      return () => clearTimeout(claimedTimer);
    }

    const coinTimer = setTimeout(() => {
      playCoinChime(soundOn, visibleCoins);
      setVisibleCoins((count) => count + 1);
    }, REVEAL_STEP_MS);

    return () => clearTimeout(coinTimer);
  }, [phase, visibleCoins, reducedMotion, soundOn]);

  const handleClose = () => {
    if (reducedMotion) {
      onClose();
      return;
    }

    setClaiming(true);
    setTimeout(onClose, 650);
  };

  return (
    <div className="reward-sequence" role="dialog" aria-modal="true" aria-label="Weekly reward">
      <p className="reward-kicker">The seventh ritual is complete</p>
      <h2 className="reward-title">Your weekly reward</h2>

      <div className="coin-canvas" aria-hidden="true">
        <Canvas
          shadows
          dpr={[1, 2]}
          resize={{ offsetSize: true }}
          camera={{ position: [0, 0.6, 6.4], fov: 42 }}
          gl={{ alpha: true, antialias: true }}
        >
          <RewardCoinsScene visibleCount={visibleCoins} claiming={claiming} reducedMotion={reducedMotion} />
        </Canvas>
      </div>

      {phase === 'claimed' ? (
        <div className="reward-claimed">
          <p className="reward-plus">+10 Coins</p>
          <p className="reward-label">Weekly reward claimed</p>
          <p className="reward-balance">Balance {balance}</p>
          <div className="reward-stats">
            <p className="stat">Streak<span className="stat-value">{streak}</span></p>
            <p className="stat">Week<span className="stat-value">{week}</span></p>
          </div>
          <button type="button" className="primary-button" onClick={handleClose}>
            <SparklesIcon />
            Continue
          </button>
        </div>
      ) : null}
    </div>
  );
}
