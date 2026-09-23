import { useEffect } from 'react';
import { MemberQr } from './MemberQr.jsx';
import { WEEK_LENGTH } from '../garden/garden-logic.js';

function shortAddress(address) {
  if (!address) {
    return '—';
  }

  if (address.length <= 10) {
    return address;
  }

  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Member dialog: the Auric avatar image, the member QR code beneath it,
 * then the member and avatar info. Escape/outside-click close.
 */
export function ProfileCard({
  memberId,
  gardenNumber,
  currentDay,
  currentStreak,
  longestStreak,
  completedWeeks,
  coinBalance,
  onClose,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const rows = [
    ['Member ID', shortAddress(memberId)],
    ['Identity', 'Auric'],
    ['Garden', gardenNumber],
    ['Current streak', `${currentStreak} days`],
    ['Longest streak', `${longestStreak} days`],
    ['This week', `${currentDay} / ${WEEK_LENGTH}`],
    ['Completed weeks', String(completedWeeks)],
  ];

  return (
    <div className="profile-backdrop" onClick={onClose} role="presentation">
      <aside
        className="profile-card"
        role="dialog"
        aria-label="Member profile"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="profile-close" onClick={onClose} aria-label="Close profile">
          ×
        </button>

        <h2 className="profile-title">Member</h2>
        <p className="profile-kicker">The keeper of {gardenNumber}</p>

        <img
          src="/tree/auric-avatar.jpg"
          alt="Auric avatar"
          className="profile-avatar-image"
        />

        <MemberQr />

        <dl className="profile-rows">
          {rows.map(([label, value]) => (
            <div key={label} className="profile-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="profile-balance">
          <p className="profile-balance-label">Coin balance</p>
          <p className="profile-balance-value">{coinBalance}</p>
        </div>
      </aside>
    </div>
  );
}
