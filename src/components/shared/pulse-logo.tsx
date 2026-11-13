// Shared brand mark: the Lifeloom weave (3×3 interlace, see public/logo.svg for
// the annotated SVG). Rendered at most once per page (header on /app, logo on
// /login), so the fixed gradient/mask ids do not collide. No halo: glow is
// reserved for the one primary action on a screen (UX pass, 13 Nov 2026).
// Pass title="" when a visible name sits beside the mark: it is then decorative.
export function PulseLogo({ className, title = 'Lifeloom' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id="llLogoGrad" gradientUnits="userSpaceOnUse" x1="14" y1="14" x2="86" y2="86">
          <stop offset="0" stopColor="#6f7bff" />
          <stop offset="1" stopColor="#34e6ff" />
        </linearGradient>
        <mask id="llLogoWarpMask">
          <rect width="100" height="100" fill="#fff" />
          <rect x="43.5" y="22" width="13" height="14" fill="#000" />
          <rect x="22.5" y="43" width="13" height="14" fill="#000" />
          <rect x="64.5" y="43" width="13" height="14" fill="#000" />
          <rect x="43.5" y="64" width="13" height="14" fill="#000" />
        </mask>
        <mask id="llLogoWeftMask">
          <rect width="100" height="100" fill="#fff" />
          <rect x="22" y="22.5" width="14" height="13" fill="#000" />
          <rect x="64" y="22.5" width="14" height="13" fill="#000" />
          <rect x="43" y="43.5" width="14" height="13" fill="#000" />
          <rect x="22" y="64.5" width="14" height="13" fill="#000" />
          <rect x="64" y="64.5" width="14" height="13" fill="#000" />
        </mask>
      </defs>
      <g fill="none" stroke="url(#llLogoGrad)" strokeWidth="9" strokeLinecap="round">
        <g mask="url(#llLogoWarpMask)" opacity="0.9">
          <line x1="29" y1="18" x2="29" y2="82" />
          <line x1="50" y1="18" x2="50" y2="82" />
          <line x1="71" y1="18" x2="71" y2="82" />
        </g>
        <g mask="url(#llLogoWeftMask)">
          <line x1="18" y1="29" x2="82" y2="29" />
          <line x1="18" y1="50" x2="82" y2="50" />
          <line x1="18" y1="71" x2="82" y2="71" />
        </g>
      </g>
    </svg>
  )
}
