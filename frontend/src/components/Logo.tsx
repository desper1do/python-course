// Знак курса: две «змейки» в скруглённом квадрате. Цвета — из темы.
// Та же геометрия лежит в public/favicon.svg — меняйте вместе.
export const LOGO_PATHS = {
  top: 'M9 17.5V12.5Q9 9 12.5 9H17.5',
  bottom: 'M23 14.5V19.5Q23 23 19.5 23H14.5',
}

export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <g fill="none" stroke="var(--on-accent)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={LOGO_PATHS.top} />
        <path d={LOGO_PATHS.bottom} />
      </g>
      <circle cx="19" cy="9" r="2.7" fill="var(--on-accent)" />
      <circle cx="13" cy="23" r="2.7" fill="var(--on-accent)" />
    </svg>
  )
}
