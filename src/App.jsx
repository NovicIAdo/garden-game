import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WEEK_LENGTH,
  advanceDevDay,
  canWaterToday,
  claimWeeklyReward,
  createGardenState,
  formatCountdown,
  getCooldownRemainingMs,
  getStatusMessage,
  isValidGardenState,
  waterGarden,
} from './garden/garden-logic.js';
import { playConnectChime, playDayCompleteChime, playWaterChime } from './garden/sound-engine.js';
import { EntryScreen } from './components/EntryScreen.jsx';
import { LoadingScreen } from './components/LoadingScreen.jsx';
import { GardenAvatar } from './components/GardenAvatar.jsx';
import { GardenPlant } from './components/GardenPlant.jsx';
import { DayProgress } from './components/DayProgress.jsx';
import { MemberQr } from './components/MemberQr.jsx';
import { WateringOverlay } from './components/WateringOverlay.jsx';
import { RewardSequence } from './components/RewardSequence.jsx';
import { ProfileCard } from './components/ProfileCard.jsx';
import {
  DropletsIcon,
  UserRoundIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  WindIcon,
} from './components/icons.jsx';

const PREFS_KEY = 'noviciado-garden-prefs';
const MEMBER_KEY = 'noviciado-member-id';

// Dev mode is forced on in every build (including production/Vercel) so the
// NEXT DAY control and `?tree=N` stage preview can be used to walk through
// the 7-day progression on deployed environments. Flip this back to
// `import.meta.env.DEV` before the public release to compile the dev-only
// branch out of production builds.
const isDevMode = true;

function gardenStorageKey(address) {
  return `noviciado-garden:${address}`;
}

/**
 * Stable local member identity for the prototype. The real system gets
 * `members.id` from the `noviciado_session` cookie (see the handoff:
 * entry_tokens → check-in → water); here a device-local id stands in.
 */
function getOrCreateMemberId() {
  try {
    const existing = window.localStorage.getItem(MEMBER_KEY);
    if (existing) {
      return existing;
    }

    const id = `NV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    window.localStorage.setItem(MEMBER_KEY, id);
    return id;
  } catch {
    return 'NV-GUEST';
  }
}

/**
 * Dev-only stage preview: open `?tree=N` (0..7) to render the garden
 * tree at a specific growth stage without connecting a wallet. Used for
 * headless preview-frame verification of the growth animation.
 */
function readTreePreviewStage() {
  const match = /[?&]tree=(\d+)/.exec(window.location.search);
  if (!match) {
    return null;
  }

  const stage = Number(match[1]);
  return Number.isFinite(stage) ? Math.min(7, Math.max(0, stage)) : null;
}

function loadGardenState(address) {
  try {
    const raw = window.localStorage.getItem(gardenStorageKey(address));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isValidGardenState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveGardenState(address, state) {
  window.localStorage.setItem(gardenStorageKey(address), JSON.stringify(state));
}

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);

    if (!raw) {
      return { soundOn: true, reducedMotion: false };
    }

    const parsed = JSON.parse(raw);

    return {
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : true,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
    };
  } catch {
    return { soundOn: true, reducedMotion: false };
  }
}

function savePrefs(prefs) {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function usePrefersReducedMotion() {
  const [systemPref, setSystemPref] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystemPref(query.matches);
    const listener = (event) => setSystemPref(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return systemPref;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

const DUST_MOTES = Array.from({ length: 18 }, (_, index) => index);

function Dust({ reducedMotion }) {
  if (reducedMotion) {
    return null;
  }

  return (
    <div className="dust-field" aria-hidden="true">
      {DUST_MOTES.map((index) => (
        <i
          key={index}
          className="dust-mote"
          style={{
            left: `${(index * 37) % 96}%`,
            top: `${35 + ((index * 29) % 60)}%`,
            animationDuration: `${7 + (index % 5)}s`,
            animationDelay: `${index * 0.43}s`,
          }}
        />
      ))}
    </div>
  );
}

export function App() {
  const memberId = useMemo(() => getOrCreateMemberId(), []);

  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [soundOn, setSoundOn] = useState(initialPrefs.soundOn);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(initialPrefs.reducedMotion);
  const systemReducedMotion = usePrefersReducedMotion();
  const reducedMotion = reducedMotionOverride || systemReducedMotion;

  const [gardenState, setGardenState] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [screen, setScreen] = useState('entry');
  const [showWatering, setShowWatering] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [cooldownLabel, setCooldownLabel] = useState('00:00:00');
  const [scanPulse, setScanPulse] = useState(0);

  useEffect(() => {
    savePrefs({ soundOn, reducedMotion: reducedMotionOverride });
  }, [soundOn, reducedMotionOverride]);

  useEffect(() => {
    if (!gardenState) {
      return;
    }

    saveGardenState(memberId, gardenState);
  }, [memberId, gardenState]);

  useEffect(() => {
    if (!gardenState || screen !== 'garden') {
      return;
    }

    const update = () => setCooldownLabel(formatCountdown(getCooldownRemainingMs(gardenState)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [gardenState, screen]);

  useEffect(() => {
    if (gardenState?.rewardPending && screen === 'garden' && !showReward) {
      const timer = setTimeout(() => setShowReward(true), 900);
      return () => clearTimeout(timer);
    }
  }, [gardenState, screen, showReward]);

  const handleEnterGarden = useCallback(() => setScreen('garden'), []);

  // The check-in is the door: a staff scan in production, a single
  // action in this prototype. It opens the member's existing garden or
  // creates a new one, behind a short leaf-loading moment.
  const handleCheckIn = useCallback(() => {
    if (checkedIn) {
      return;
    }

    setCheckedIn(true);
    playConnectChime(soundOn);

    const existing = loadGardenState(memberId);
    setGardenState(existing ?? createGardenState(memberId));
    setScreen('loading');
    window.setTimeout(() => setScreen('garden'), 1800);
  }, [checkedIn, memberId, soundOn]);

  const handleWaterClick = useCallback(() => {
    if (!gardenState || !canWaterToday(gardenState)) {
      return;
    }

    setShowWatering(true);
  }, [gardenState]);

  const handleWateringComplete = useCallback(() => {
    setShowWatering(false);
    setGardenState((current) => {
      if (!current) {
        return current;
      }

      const next = waterGarden(current);

      if (next.currentDay !== current.currentDay) {
        playWaterChime(soundOn);
        setScanPulse((value) => value + 1);

        if (next.currentDay >= WEEK_LENGTH) {
          playDayCompleteChime(soundOn);
        }
      }

      return next;
    });
  }, [soundOn]);

  const handleRewardClose = useCallback(() => {
    setGardenState((current) => (current ? claimWeeklyReward(current) : current));
    setShowReward(false);
  }, []);

  const handleDevNextDay = useCallback(() => {
    setGardenState((current) => (current ? advanceDevDay(current) : current));
  }, []);

  if (isDevMode) {
    const treePreviewStage = readTreePreviewStage();
    if (treePreviewStage !== null) {
      return (
        <main className="app" data-reduced-motion={false}>
          <section className="garden-stage">
            <div className="garden-column plant-column">
              <GardenPlant stage={treePreviewStage} reducedMotion={false} />
              <p className="stage-label">Growth · {treePreviewStage}/7</p>
            </div>
          </section>
        </main>
      );
    }
  }

  if (!checkedIn) {
    return <EntryScreen onCheckIn={handleCheckIn} />;
  }

  if (screen === 'loading') {
    return <LoadingScreen />;
  }

  if (!gardenState) {
    return (
      <div className="loading-state" role="status">
        <p>PREPARING YOUR GARDEN…</p>
      </div>
    );
  }

  const canWater = canWaterToday(gardenState);
  const displayDay = gardenState.currentDay === 0 ? 1 : gardenState.currentDay;
  const daysUntilReward = WEEK_LENGTH - gardenState.currentDay;
  const statusMessage = getStatusMessage(gardenState);

  return (
    <main className="app" data-reduced-motion={reducedMotion}>
      <Dust reducedMotion={reducedMotion} />

      <header className="app-header">
        <div>
          <p className="brand-kicker">Noviciado</p>
          <p className="brand-title">The Garden</p>
        </div>

        <div className="header-controls">
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setSoundOn((value) => !value)}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
          >
            {soundOn ? <VolumeOnIcon /> : <VolumeOffIcon />}
            <span className="icon-toggle-label">Sound</span>
          </button>
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setReducedMotionOverride((value) => !value)}
            aria-pressed={reducedMotionOverride}
            aria-label="Toggle reduced motion"
          >
            <WindIcon />
            <span className="icon-toggle-label">Motion</span>
          </button>
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setShowProfile(true)}
            aria-label="Open member profile"
          >
            <UserRoundIcon />
            <span className="icon-toggle-label">Member</span>
          </button>
        </div>
      </header>

      <section className="garden-stage">
        <div className="garden-column avatar-column">
          <GardenAvatar
            size="large"
            scanPulse={scanPulse}
            reducedMotion={reducedMotion}
            currentDay={gardenState.currentDay}
            totalDays={WEEK_LENGTH}
          />
          <div className="column-qr">
            <MemberQr />
          </div>
          <p className="stage-label">Identity · Auric</p>
        </div>

        <div className="garden-column plant-column">
          <GardenPlant stage={gardenState.currentDay} reducedMotion={reducedMotion} />
          <p className="stage-label">Growth · {gardenState.currentDay}/7</p>
        </div>
      </section>

      <section className="ritual-panel">
        <p className="ritual-day-label">
          Day <span className="day-number">{pad2(displayDay)}</span> / {pad2(WEEK_LENGTH)}
        </p>
        <p className="ritual-status" aria-live="polite">{statusMessage}</p>

        {canWater ? (
          <button type="button" className="primary-button ritual-cta" onClick={handleWaterClick}>
            <DropletsIcon />
            Water the garden
          </button>
        ) : (
          <div className="ritual-cooldown" aria-live="polite">
            <p className="ritual-cooldown-title">
              Garden watered
              {!gardenState.rewardPending ? (
                <>
                  {' '}· Next ritual in <span className="ritual-cooldown-timer">{cooldownLabel}</span>
                </>
              ) : null}
            </p>
          </div>
        )}

        <DayProgress currentDay={gardenState.currentDay} />

        {daysUntilReward > 0 && gardenState.currentDay > 0 ? (
          <p className="ritual-countdown-label">{daysUntilReward} days until reward</p>
        ) : null}

        {isDevMode ? (
          <button type="button" className="dev-button" onClick={handleDevNextDay}>
            DEV / TEST MODE — NEXT DAY
          </button>
        ) : null}
      </section>

      {showWatering ? (
        <WateringOverlay
          onComplete={handleWateringComplete}
          reducedMotion={reducedMotion}
          fromStage={gardenState.currentDay}
          toStage={Math.min(WEEK_LENGTH, gardenState.currentDay + 1)}
        />
      ) : null}

      {showReward ? (
        <RewardSequence
          onClose={handleRewardClose}
          balance={gardenState.coinBalance + 10}
          streak={gardenState.currentStreak}
          week={gardenState.completedWeeks + 1}
          soundOn={soundOn}
          reducedMotion={reducedMotion}
        />
      ) : null}

      {showProfile ? (
        <ProfileCard
          memberId={memberId}
          gardenNumber={gardenState.gardenNumber}
          currentDay={gardenState.currentDay}
          currentStreak={gardenState.currentStreak}
          longestStreak={gardenState.longestStreak}
          completedWeeks={gardenState.completedWeeks}
          coinBalance={gardenState.coinBalance}
          onClose={() => setShowProfile(false)}
        />
      ) : null}

      <p className="footer-note">A private digital ritual by Noviciado.</p>
    </main>
  );
}
