/**
 * Mock member QR code. In production this encodes the single-use entry
 * token URL (see the check-in handoff); here it is a decorative
 * stand-in for the member's door QR.
 */

const QR_PATTERN = [
  '11111011111',
  '10001010001',
  '10101010101',
  '10001010001',
  '11111011111',
  '01010100101',
  '11111010101',
  '10001010010',
  '10101001001',
  '10001010010',
  '11111000111',
];

export function MemberQr() {
  return (
    <div className="entry-qr" aria-hidden="true">
      {QR_PATTERN.flatMap((row, rowIndex) =>
        [...row].map((cell, colIndex) => (
          <i
            key={`${rowIndex}-${colIndex}`}
            className={`entry-qr-cell${cell === '1' ? ' is-dark' : ''}`}
          />
        )),
      )}
    </div>
  );
}
