/**
 * Loading moment between check-in and the garden: the spinning leaf on
 * pure black, with the ritual label.
 */
export function LoadingScreen() {
  return (
    <section className="loading-screen" role="status" aria-live="polite">
      <video
        className="loading-leaf"
        src="/tree/leaf.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      <p className="loading-label">PREPARING YOUR GARDEN…</p>
    </section>
  );
}
