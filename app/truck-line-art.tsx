export function TruckLineArt({
  className = "",
  tall = false,
}: {
  className?: string;
  tall?: boolean;
}) {
  const flutes = tall
    ? [60, 80, 100, 120, 140, 160, 180, 200]
    : [80, 98, 116, 134, 152, 170, 188, 206];
  const seams = [220, 390, 550];
  const grilleLines = [158, 170, 182, 194];
  const bodyTop = tall ? 44 : 58;
  const bodyHeight = tall ? 170 : 156;
  const seamTop = tall ? 48 : 62;
  const unitTop = tall ? 140 : 148;
  const unitHeight = tall ? 74 : 66;
  return (
    <svg
      viewBox="0 40 1060 240"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M30 258 H1030"
        stroke="#6366f1"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeDasharray="4 8"
      />
      {[80, 330, 600, 860].map((x) => (
        <circle key={x} cx={x} cy="258" r="3" fill="#4f46e5" fillOpacity="0.4" />
      ))}

      {/* Reefer trailer — long fleet box carrying the TRUXERA message */}
      <rect
        x="40"
        y={bodyTop}
        width="640"
        height={bodyHeight}
        rx="8"
        fill="#e9eef8"
        stroke="#4f46e5"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      {flutes.map((y) => (
        <line
          key={y}
          x1="46"
          y1={y}
          x2="674"
          y2={y}
          stroke="#64748b"
          strokeOpacity="0.16"
          strokeWidth="1"
        />
      ))}
      {seams.map((x) => (
        <line
          key={x}
          x1={x}
          x2={x}
          y1={seamTop}
          y2="210"
          stroke="#64748b"
          strokeOpacity="0.14"
          strokeWidth="1"
        />
      ))}

      {/* Fleet branding printed on the trailer side */}
      <text
        x="360"
        y="98"
        textAnchor="middle"
        fontSize="48"
        fontWeight="800"
        letterSpacing="12"
        fill="#312e81"
        fillOpacity="0.9"
      >
        TRUXERA
      </text>
      <text
        x="360"
        y="122"
        textAnchor="middle"
        fontSize="15"
        fontWeight="600"
        letterSpacing="2.5"
        fill="#4338ca"
        fillOpacity="0.75"
      >
        AI-Powered Intelligent Fleet
      </text>
      <text
        x="360"
        y="141"
        textAnchor="middle"
        fontSize="15"
        fontWeight="600"
        letterSpacing="2.5"
        fill="#4338ca"
        fillOpacity="0.75"
      >
        Operations &amp; Recovery Platform
      </text>
      <line
        x1="190"
        y1="158"
        x2="530"
        y2="158"
        stroke="#4f46e5"
        strokeOpacity="0.4"
        strokeWidth="2"
      />
      <text
        x="360"
        y="178"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        letterSpacing="2"
        fill="#475569"
        fillOpacity="0.85"
      >
        Detect Risk. Predict Disruption.
      </text>
      <text
        x="360"
        y="196"
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        letterSpacing="2"
        fill="#475569"
        fillOpacity="0.85"
      >
        Recommend Recovery. Measure Impact.
      </text>

      {/* Reefer unit at trailer front */}
      <rect
        x="636"
        y={unitTop}
        width="50"
        height={unitHeight}
        rx="5"
        fill="#d3ddef"
        stroke="#4f46e5"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {grilleLines.map((y) => (
        <line
          key={y}
          x1="642"
          y1={y}
          x2="680"
          y2={y}
          stroke="#64748b"
          strokeOpacity="0.4"
          strokeWidth="1.5"
        />
      ))}
      <circle
        cx="661"
        cy="182"
        r="9"
        stroke="#64748b"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />

      {/* Landing gear */}
      <rect x="606" y="214" width="9" height="24" fill="#94a3b8" />
      <rect x="625" y="214" width="9" height="24" fill="#94a3b8" />
      <rect x="600" y="236" width="42" height="7" rx="2" fill="#64748b" />

      {/* Trailer wheels — tandem axle */}
      {[140, 228].map((cx) => (
        <g key={cx}>
          <circle cx={cx - 4} cy="230" r="26" fill="#2b3442" />
          <circle cx={cx} cy="230" r="27" fill="#334155" />
          <circle cx={cx} cy="230" r="17" fill="#475569" />
          <circle cx={cx} cy="230" r="8" fill="#cbd5e1" />
          <circle cx={cx} cy="230" r="3" fill="#64748b" />
        </g>
      ))}
      <rect x="92" y="230" width="180" height="7" rx="3" fill="#64748b" />

      {/* Fifth wheel coupling */}
      <path d="M708 218 L758 218 L748 208 L716 208 Z" fill="#475569" />

      {/* Fuel tank */}
      <rect
        x="728"
        y="224"
        width="56"
        height="24"
        rx="12"
        fill="#cbd5e1"
        stroke="#64748b"
        strokeWidth="1.5"
      />

      {/* Frame rail */}
      <rect x="700" y="230" width="306" height="8" rx="2" fill="#64748b" />

      {/* Exhaust stack */}
      <rect
        x="780"
        y="98"
        width="10"
        height="128"
        rx="3"
        fill="#94a3b8"
        stroke="#64748b"
        strokeWidth="1"
      />
      <rect x="778" y="92" width="14" height="8" rx="2" fill="#64748b" />

      {/* Aerodynamic cab */}
      <path
        d="M794 110 L852 86 L910 104 L938 116 L950 140 L952 168 L918 180 L852 186 L798 178 L792 142 Z"
        fill="#eef2fa"
        stroke="#3f4a6b"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M858 98 L902 112 L922 120 L894 126 L860 110 Z"
        fill="#4f46e5"
        fillOpacity="0.4"
        stroke="#3f4a6b"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M806 116 L844 104 L848 130 L810 142 Z"
        fill="#4f46e5"
        fillOpacity="0.28"
        stroke="#3f4a6b"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M852 100 L858 182"
        stroke="#3f4a6b"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {[140, 150, 160].map((y) => (
        <line
          key={y}
          x1="932"
          y1={y}
          x2="948"
          y2={y}
          stroke="#3f4a6b"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
      ))}
      <rect
        x="932"
        y="154"
        width="16"
        height="10"
        rx="2"
        fill="#e2e8f0"
        stroke="#64748b"
        strokeWidth="1"
      />
      <rect x="938" y="168" width="18" height="12" rx="3" fill="#64748b" />
      <rect x="834" y="186" width="48" height="7" rx="2" fill="#94a3b8" />
      <rect x="828" y="194" width="42" height="7" rx="2" fill="#94a3b8" opacity="0.85" />

      {/* Tractor wheels — steer + tandem drive */}
      {[946, 894, 836].map((cx, i) => {
        const r = i === 0 ? 24 : 27;
        return (
          <g key={cx}>
            <circle cx={cx} cy="230" r={r} fill="#334155" />
            <circle cx={cx} cy="230" r={r - 9} fill="#475569" />
            <circle cx={cx} cy="230" r={r - 19} fill="#cbd5e1" />
            <circle cx={cx} cy="230" r="3.5" fill="#64748b" />
          </g>
        );
      })}
      <rect x="922" y="232" width="48" height="6" rx="2" fill="#475569" />
      <rect x="792" y="232" width="12" height="22" rx="2" fill="#334155" opacity="0.85" />
    </svg>
  );
}
