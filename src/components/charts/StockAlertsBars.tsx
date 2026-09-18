/**
 * Textura decorativa de barras (densidad creciente), sin eje numérico —
 * un eje con números implicaría una serie real que no tenemos. La única
 * barra que porta significado real es la última: rojo si hay alertas,
 * verde si no.
 */
export function StockAlertsBars({ ok }: { ok: boolean }) {
  const bars = Array.from({ length: 21 }, (_, i) => ({
    height: 20 + i * 3,
    opacity: 0.12 + (i / 20) * 0.55,
  }));

  return (
    <div className="flex h-16 items-end gap-[3px]" aria-hidden="true">
      {bars.map((bar, i) => {
        const isLast = i === bars.length - 1;
        return (
          <div
            key={i}
            className={
              'w-[3px] rounded-full ' + (isLast ? (ok ? 'bg-success' : 'bg-danger-solid') : 'bg-ink-muted')
            }
            style={{ height: `${bar.height}%`, opacity: isLast ? 1 : bar.opacity }}
          />
        );
      })}
    </div>
  );
}
