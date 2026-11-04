/**
 * Original editorial visual for the auth side panel: concentric planning
 * orbits (goal → milestones → tasks) over a day timeline. Pure SVG, no
 * raster assets, no gradients, no animation (reduced-motion safe).
 */
export function AuthVisual() {
  return (
    <svg
      viewBox="0 0 480 360"
      role="img"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full max-w-md text-line"
    >
      {/* orbit rings */}
      <circle cx="240" cy="158" r="52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="240" cy="158" r="92" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="240"
        cy="158"
        r="132"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 7"
      />
      {/* progress arc on the middle orbit */}
      <path
        d="M 240 66 A 92 92 0 0 1 319 204"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-accent"
      />
      {/* orbit nodes: goal, milestone, task */}
      <circle cx="240" cy="158" r="10" className="fill-accent" />
      <circle cx="240" cy="158" r="4" className="fill-accent-content" />
      <circle cx="240" cy="66" r="6" fill="currentColor" className="text-content" />
      <circle cx="319" cy="204" r="6" fill="currentColor" className="text-content" />
      <circle cx="148" cy="158" r="4.5" fill="currentColor" className="text-muted" />
      {/* day timeline */}
      <line x1="72" y1="296" x2="408" y2="296" stroke="currentColor" strokeWidth="1.5" />
      <rect x="96" y="284" width="72" height="24" rx="6" fill="currentColor" className="text-content" opacity="0.85" />
      <rect x="180" y="284" width="104" height="24" rx="6" className="fill-accent" />
      <rect x="296" y="284" width="56" height="24" rx="6" fill="currentColor" className="text-muted" opacity="0.55" />
    </svg>
  );
}
