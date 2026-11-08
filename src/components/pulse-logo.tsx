// Shared brand mark. Rendered at most once per page (header on /app, logo on
// /login), so the fixed gradient id does not collide.
export function PulseLogo({ className, title = 'Lifeloom' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      style={{ filter: 'drop-shadow(0 0 6px rgba(52,230,255,0.5))' }}
    >
      <defs>
        <linearGradient id="pulseLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6f7bff" />
          <stop offset="1" stopColor="#34e6ff" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="36" fill="none" stroke="url(#pulseLogoGrad)" strokeWidth="3" opacity="0.26" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="url(#pulseLogoGrad)" strokeWidth="4" opacity="0.55" />
      <circle cx="50" cy="50" r="12" fill="url(#pulseLogoGrad)" />
    </svg>
  )
}
