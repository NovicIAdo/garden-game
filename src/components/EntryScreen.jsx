import { MemberQr } from './MemberQr.jsx';

/**
 * Cinematic entry on pure black: the looping dream video as the hero,
 * NOVICIADO brand, and the check-in action. In the real club a staff
 * member scans the member's QR at the door and the check-in grants
 * water — this prototype simulates that moment with a single action.
 */
export function EntryScreen({ onCheckIn }) {
  return (
    <section className="entry-screen">
      <div className="entry-composition">
        <video
          className="entry-video"
          src="/tree/dream.mp4"
          autoPlay
          muted
          loop
          playsInline
        />

        <p className="brand-kicker">Noviciado</p>
        <h1 className="brand-title">The Garden</h1>
        <p className="entry-subtitle">Check in at the club. Water your tree.</p>

        <button
          type="button"
          className="primary-button entry-cta"
          onClick={onCheckIn}
        >
          <span className="button-dot" aria-hidden="true" />
          Check in
        </button>

        <p className="entry-chain-label">Noviciado Coffee · Members</p>
      </div>

      <p className="entry-footnote">A private digital ritual by Noviciado.</p>
    </section>
  );
}
