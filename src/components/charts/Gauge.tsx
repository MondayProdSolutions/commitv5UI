/**
 * Medidor semicircular SVG (arco de 180°), sin dependencias externas. El dot
 * indicador se posiciona por trigonometría a partir de `value/max`; solo
 * anima su entrada (fade+drop vía `.reveal`), no un recorrido en vivo — el
 * valor no cambia dentro de una misma carga de página, así que animar un
 * "barrido" sería decoración sin propósito.
 */
export function Gauge({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(value, max));
  const frac = max > 0 ? clamped / max : 0;

  const width = 220;
  const height = 128;
  const cx = width / 2;
  const cy = height - 8;
  const r = 92;

  const angleRad = ((180 - frac * 180) * Math.PI) / 180;
  const dotX = cx + r * Math.cos(angleRad);
  const dotY = cy - r * Math.sin(angleRad);

  const ticks = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const a = ((180 - t * 180) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), opacity: 0.15 + t * 0.55 };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label ?? 'Medidor'}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        className="stroke-line"
        strokeWidth={2}
      />
      {ticks.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={2.5} className="fill-ink-subtle" opacity={t.opacity} />
      ))}
      <circle
        cx={dotX}
        cy={dotY}
        r={7}
        className="reveal fill-primary"
        style={{ transformOrigin: `${dotX}px ${dotY}px` }}
      />
      <text x={cx - r} y={cy + 16} textAnchor="start" className="fill-ink-subtle text-[10px]">
        0
      </text>
      <text x={cx + r} y={cy + 16} textAnchor="end" className="fill-ink-subtle text-[10px]">
        {max}
      </text>
    </svg>
  );
}
