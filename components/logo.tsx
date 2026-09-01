/**
 * Markwise mark — a vector redraw of the brand logo.
 *
 * The letter M is built from two navy strokes; its second diagonal is
 * deliberately left open and completed by the cyan check, so the mark reads
 * as both an M and a tick. The three bars beneath are the class distribution.
 *
 * Colours are fixed brand values rather than theme tokens: a logo keeps its
 * identity on either ground. `navy` lightens in dark mode only enough to stay
 * legible, which is why it is exposed as a prop.
 */
export function MarkwiseMark({
  className,
  navy = "var(--logo-navy)",
  cyan = "var(--logo-cyan)",
  title,
}: {
  className?: string;
  navy?: string;
  cyan?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 96"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {title ? <title>{title}</title> : null}

      {/* Left leg and full descending diagonal */}
      <path
        d="M40 29 L11 0 L0 0 L0 88 L11 80 L11 15.5 L40 44.5 Z"
        fill={navy}
      />

      {/* Right leg and the short upper stub of the second diagonal */}
      <path
        d="M74 15 L89 0 L100 0 L100 88 L89 80 L89 15.5 L74 30.5 Z"
        fill={navy}
      />

      {/* The check that completes the M */}
      <path
        d="M27.9 42.9 L40.9 55.9 L74 22.75"
        stroke={cyan}
        strokeWidth="11"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />

      {/* Distribution bars */}
      <rect x="26.6" y="81.2" width="9.4" height="14.3" rx="2.6" fill={cyan} />
      <rect x="44.6" y="69.2" width="10" height="26.3" rx="2.6" fill={cyan} />
      <rect x="62.8" y="79.6" width="9.4" height="15.9" rx="2.6" fill={cyan} />
    </svg>
  );
}

/** Horizontal lockup: mark plus wordmark, as supplied. */
export function MarkwiseLogo({
  className,
  markClassName = "h-6 w-auto",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <MarkwiseMark className={markClassName} title="Markwise" />
      <span className="font-sans text-[18px] font-semibold tracking-[-0.02em] text-[var(--logo-navy)] leading-none">
        Markwise
      </span>
    </span>
  );
}
