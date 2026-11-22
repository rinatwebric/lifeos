/**
 * Editorial visual for the auth side panel: concentric planning orbits
 * (goal → milestones → tasks) over a day timeline. Quiet line work, one amber
 * data arc and its node. Pure SVG, no raster assets, no gradients, no
 * animation (reduced-motion safe).
 */
export function AuthVisual() {
  return (
    <svg
      viewBox="0 0 480 360"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full max-w-md text-line"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="240" cy="158" r="52" />
        <circle cx="240" cy="158" r="92" />
        <circle
          cx="240"
          cy="158"
          r="132"
          strokeDasharray="2 8"
          className="stroke-muted"
          opacity="0.45"
        />
        <path
          d="M 240 66 A 92 92 0 0 1 319 204"
          className="stroke-accent"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      <g className="fill-surface stroke-content" strokeWidth="1.25">
        <circle cx="240" cy="158" r="9" />
        <circle cx="240" cy="66" r="5" />
        <circle cx="148" cy="158" r="4" className="stroke-muted" />
      </g>
      <circle cx="319" cy="204" r="5" className="fill-accent" />

      <g fill="none" strokeLinecap="round">
        <path d="M72 296H408" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M104 284V308M168 290V302M232 284V308M296 290V302M360 284V308"
          className="stroke-muted"
          strokeWidth="1.25"
        />
        <path d="M112 296H192" className="stroke-content" strokeWidth="3" />
        <path d="M248 296H304" className="stroke-muted" strokeWidth="3" opacity="0.5" />
      </g>
    </svg>
  );
}
