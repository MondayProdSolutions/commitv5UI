import type { ChartDatum } from './BarChart';

/** Gráfica de línea/área SVG para tendencias, sin dependencias externas. */
export function LineChart({
  data,
  formatValue = (n) => String(n),
}: {
  data: ChartDatum[];
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-subtle">Sin datos en este período.</p>;
  }
  if (data.length === 1) {
    return (
      <p className="text-sm text-ink-muted">
        {data[0].label}: <span className="font-medium text-ink">{formatValue(data[0].value)}</span>
      </p>
    );
  }

  const width = 480;
  const height = 220;
  const padding = 28;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((d.value - min) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfica de tendencia">
      <path d={areaPath} className="fill-primary-soft" />
      <path d={linePath} className="fill-none stroke-primary" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={data[i].label} cx={p.x} cy={p.y} r={2.5} className="fill-primary" />
      ))}
      {data.map((d, i) => (
        <text
          key={d.label}
          x={points[i].x}
          y={height - padding + 14}
          textAnchor="middle"
          className="fill-ink-muted text-[8px]"
        >
          {d.label.length > 5 ? d.label.slice(5) : d.label}
        </text>
      ))}
    </svg>
  );
}
