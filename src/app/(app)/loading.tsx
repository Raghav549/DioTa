/**
 * Instant navigation boundary: a tap on a screen that isn't in the router cache yet switches at
 * once (keeping the header and tab bar) instead of waiting for the server. It is only on screen for
 * the length of that round trip, so it draws nothing of its own.
 */
export default function Loading() {
  return <div className="min-h-[60dvh]" aria-busy="true" />;
}
