// Full-screen loader while a trip is planned: a leather suitcase whose lid opens and swallows travel items.
// Placed on the three panels between the straps (straps sit at x 84-96 and 144-156).
const STICKERS = [
  { x: 61, y: 156, rx: 18, ry: 13, rot: -12, bg: '#c8402a', fg: '#ffffff', n: '01' },
  { x: 120, y: 152, rx: 20, ry: 14, rot: 7, bg: '#e3a72b', fg: '#16213f', n: '02' },
  { x: 179, y: 160, rx: 16, ry: 16, rot: 0, bg: '#2a47a0', fg: '#ffffff', n: '03' },
  { x: 120, y: 194, rx: 17, ry: 11, rot: -5, bg: '#1f6b4c', fg: '#ffffff', n: '04' },
  { x: 62, y: 195, rx: 14, ry: 10, rot: 9, bg: '#b8506f', fg: '#ffffff', n: '05' },
]

function Sticker({ x, y, rx, ry, rot, bg, fg, n }) {
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={bg} />
      <ellipse cx={x} cy={y} rx={rx - 3} ry={ry - 3} fill="none" stroke={fg} strokeWidth="1.2" />
      <text x={x} y={y + 5} textAnchor="middle" fill={fg} className="pk-num">{n}</text>
    </g>
  )
}

export default function PackingLoader({ t, city, step, total }) {
  return (
    <div className="packing" role="status" aria-live="polite">
      <svg className="pk-art" viewBox="0 0 240 240" aria-hidden>
        <defs>
          {/* items vanish once they pass the suitcase mouth */}
          <clipPath id="pk-mouth"><rect x="0" y="-120" width="240" height="230" /></clipPath>
        </defs>

        <ellipse cx="120" cy="222" rx="92" ry="7" fill="#16213f" opacity=".25" />

        {/* interior seen when the lid lifts */}
        <rect x="44" y="99" width="152" height="12" rx="5" fill="#3b2414" />

        {/* lid hinges on its right edge and swings back */}
        <g className="pk-lid">
          <rect x="34" y="96" width="172" height="20" rx="9" fill="#9a6640" stroke="#5e3a1f" strokeWidth="3" />
          <path d="M100 96 v-12 q0 -6 6 -6 h28 q6 0 6 6 v12" fill="none" stroke="#3b2414" strokeWidth="6" strokeLinecap="round" />
        </g>
        <g clipPath="url(#pk-mouth)">
          <g className="pk-item pk-i1">{/* camera */}
            <rect x="96" y="20" width="48" height="32" rx="6" fill="#e6e9ed" />
            <rect x="104" y="14" width="14" height="8" rx="2" fill="#e6e9ed" />
            <rect x="96" y="28" width="48" height="5" fill="#c8402a" />
            <circle cx="120" cy="36" r="11" fill="#16213f" /><circle cx="120" cy="36" r="6" fill="#2a47a0" /><circle cx="117" cy="33" r="2" fill="#ffffff" />
          </g>
          <g className="pk-item pk-i2">{/* sunglasses */}
            <circle cx="104" cy="34" r="12" fill="#2a47a0" stroke="#e3a72b" strokeWidth="3" /><circle cx="136" cy="34" r="12" fill="#2a47a0" stroke="#e3a72b" strokeWidth="3" />
            <path d="M116 32 q4 -5 8 0" stroke="#e3a72b" strokeWidth="3" fill="none" />
            <circle cx="100" cy="30" r="3" fill="#b4c6db" /><circle cx="132" cy="30" r="3" fill="#b4c6db" />
          </g>
          <g className="pk-item pk-i3">{/* folded map */}
            <path d="M92 18 l18 6 l20 -6 l18 6 v34 l-18 -6 l-20 6 l-18 -6 z" fill="#e3a72b" />
            <path d="M110 24 v34 M130 18 v34" stroke="#b9831c" strokeWidth="1.5" />
            <path d="M98 40 q12 -10 22 0 t22 -4" stroke="#c8402a" strokeWidth="2.5" fill="none" strokeDasharray="4 3" />
          </g>
          <g className="pk-item pk-i4">{/* t-shirt */}
            <path d="M104 16 l-16 10 l8 12 l8 -4 v26 h32 v-26 l8 4 l8 -12 l-16 -10 q-8 8 -16 0 z" fill="#1f6b4c" />
          </g>
        </g>

        {/* body */}
        <rect x="36" y="108" width="168" height="108" rx="16" fill="#8a5a35" />
        <rect x="36" y="108" width="168" height="108" rx="16" fill="none" stroke="#5e3a1f" strokeWidth="3" />
        <path d="M40 124 h160" stroke="#6e4527" strokeWidth="2" />
        {/* straps with buckles */}
        <rect x="84" y="108" width="12" height="108" fill="#5a371f" />
        <rect x="144" y="108" width="12" height="108" fill="#5a371f" />
        <rect x="81" y="128" width="18" height="12" rx="2" fill="none" stroke="#e3a72b" strokeWidth="2.5" />
        <rect x="141" y="128" width="18" height="12" rx="2" fill="none" stroke="#e3a72b" strokeWidth="2.5" />
        {STICKERS.map(s => <Sticker key={s.n} {...s} />)}
        {/* corner caps */}
        {[[40, 204], [200, 204]].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="6" fill="#3b2414" />)}

      </svg>

      <p className="pk-title">{t.packing}</p>
      {city && <p className="pk-step">{total > 1 ? t.packingStep(city, step, total) : city}</p>}
      <p className="pk-wait">{t.packingWait}</p>
    </div>
  )
}
