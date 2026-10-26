// PIP-7, drawn as a glowing wireframe. `mood` changes the eye: idle | happy | alert.
export default function Robot({ size = 160, mood = 'idle', className = '' }) {
  return (
    <svg className={`pip7 pip7-${mood} ${className}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="pip-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent2)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pip-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--panel3)" />
          <stop offset="1" stopColor="var(--panel)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="96" r="92" fill="url(#pip-glow)" />
      {/* orbit rings */}
      <ellipse className="pip-orbit" cx="100" cy="100" rx="88" ry="26" fill="none" stroke="var(--accent2)" strokeOpacity="0.25" strokeDasharray="2 6" />
      {/* antenna */}
      <line x1="100" y1="44" x2="100" y2="24" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle className="pip-beacon" cx="100" cy="20" r="6" fill="var(--accent)" />
      {/* head */}
      <rect x="46" y="44" width="108" height="86" rx="22" fill="url(#pip-body)" stroke="var(--accent2)" strokeWidth="2.5" />
      <rect x="58" y="58" width="84" height="48" rx="12" fill="var(--code-bg)" stroke="var(--accent2)" strokeOpacity="0.5" />
      {/* visor scan line */}
      <rect className="pip-scan" x="60" y="60" width="80" height="3" fill="var(--accent2)" opacity="0.5" />
      {/* eyes */}
      {mood === 'happy' ? (
        <g stroke="var(--accent2)" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M73 86q8-10 16 0" />
          <path d="M111 86q8-10 16 0" />
        </g>
      ) : (
        <g className="pip-eyes" fill={mood === 'alert' ? 'var(--err)' : 'var(--accent2)'}>
          <rect x="74" y="74" width="14" height="16" rx="4" />
          <rect x="112" y="74" width="14" height="16" rx="4" />
        </g>
      )}
      {/* mouth grille */}
      <g stroke="var(--accent2)" strokeOpacity="0.6" strokeWidth="2">
        <line x1="84" y1="118" x2="84" y2="124" />
        <line x1="94" y1="118" x2="94" y2="124" />
        <line x1="104" y1="118" x2="104" y2="124" />
        <line x1="114" y1="118" x2="114" y2="124" />
      </g>
      {/* ears */}
      <rect x="36" y="74" width="10" height="28" rx="4" fill="var(--panel3)" stroke="var(--accent2)" strokeWidth="2" />
      <rect x="154" y="74" width="10" height="28" rx="4" fill="var(--panel3)" stroke="var(--accent2)" strokeWidth="2" />
      {/* body */}
      <path d="M70 134h60l10 30H60l10-30Z" fill="url(#pip-body)" stroke="var(--accent2)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="100" y="155" textAnchor="middle" className="pip-label">PIP-7</text>
      {/* treads */}
      <rect x="52" y="166" width="96" height="14" rx="7" fill="var(--panel3)" stroke="var(--accent2)" strokeWidth="2" />
      <g fill="var(--accent2)" opacity="0.7">
        {[62, 76, 90, 104, 118, 132].map((x) => (
          <circle key={x} cx={x + 3} cy="173" r="2.5" />
        ))}
      </g>
    </svg>
  );
}
