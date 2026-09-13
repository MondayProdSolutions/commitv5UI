export type ChartDatum = { label: string; value: number };

/**
 * Gráfica de barras SVG, sin dependencias externas. `orientacion='horizontal'`
 * usa barras CSS (mejor para etiquetas largas, p. ej. nombres de producto);
 * `'vertical'` (default) usa un `<svg>` con barras + etiquetas de eje X.
 */
export function BarChart({
  data,
  orientacion = 'vertical',
  formatValue = (n) => String(n),
}: {
  data: ChartDatum[];
  orientacion?: 'vertical' | 'horizontal';
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-subtle">Sin datos en este período.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 0) || 1;

  if (orientacion === 'horizontal') {
    return (
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span className="truncate">{d.label}</span>
              <span className="shrink-0 font-medium text-ink">{formatValue(d.value)}</span>
            </div>
            <div className="h-3 w-full rounded bg-primary-soft">
              <div
                className="h-3 rounded bg-primary"
                style={{ width: `${d.value > 0 ? Math.max((d.value / max) * 100, 2) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const width = 480;
  const height = 220;
  const padding = 28;
  const barGap = 8;
  const barWidth = (width - padding * 2 - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfica de barras">
      {data.map((d, i) => {
        const barHeight = d.value > 0 ? Math.max((d.value / max) * (height - padding * 2), 2) : 0;
        const x = padding + i * (barWidth + barGap);
        const y = height - padding - barHeight;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="fill-primary" />
            <text
              x={x + barWidth / 2}
              y={height - padding + 14}
              textAnchor="middle"
              className="fill-ink-muted text-[9px]"
            >
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
            <text
              x={x + barWidth / 2}
              y={Math.max(y - 4, 10)}
              textAnchor="middle"
              className="fill-ink text-[9px] font-medium"
            >
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
