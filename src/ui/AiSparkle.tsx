/**
 * The Ask AI mark (Oisin, 17 Nov): a large and a small four-point sparkle in amber. The one place
 * a colour other than the accent is used on purpose, so the AI is easy to spot.
 */
export function AiSparkle({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M10 3c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5C7.4 9 9.5 6.9 10 3Z" fill="#F0A030" />
      <path d="M17.5 13.5c.3 2 1.3 3 3.3 3.3-2 .3-3 1.3-3.3 3.3-.3-2-1.3-3-3.3-3.3 2-.3 3-1.3 3.3-3.3Z" fill="#F7C25C" />
    </svg>
  );
}
