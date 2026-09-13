import { ValidationError } from '@/lib/errors';

export type DescuentoInput = { tipo: 'monto' | 'porcentaje'; valor: number } | null | undefined;

export type SaleLineInput = {
  variantId: string;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  descuento?: DescuentoInput;
};
export type SaleComputeInput = { lineas: SaleLineInput[]; descuentoTicket?: DescuentoInput };

export type SaleComputeResultLine = {
  variantId: string;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  baseBruta: number;
  descuentoLinea: number;
  descuentoTicketProrrateado: number;
  baseNeta: number;
  impuesto: number;
  total: number;
};
export type SaleComputeResult = {
  lineas: SaleComputeResultLine[];
  subtotal: number;
  descuentoLineas: number;
  descuentoTicket: number;
  impuestos: number;
  total: number;
};

// Centavos enteros para evitar deriva de coma flotante.
const toCents = (x: number) => Math.round(x * 100);
const fromCents = (c: number) => c / 100;
const round2 = (x: number) => fromCents(Math.round(x * 100 + (x >= 0 ? 1e-6 : -1e-6)));

function descuentoEnCentavos(d: DescuentoInput, baseCents: number, path: string): number {
  if (d == null) return 0;
  if (!(d.valor > 0)) throw new ValidationError({ [path]: 'El descuento debe ser mayor que 0.' });
  const raw = d.tipo === 'porcentaje'
    ? Math.round((baseCents * d.valor) / 100)
    : toCents(d.valor);
  return Math.max(0, Math.min(raw, baseCents)); // acotado a [0, base]
}

export function computeSale(input: SaleComputeInput): SaleComputeResult {
  const { lineas, descuentoTicket } = input;
  if (!lineas.length) throw new ValidationError({ lineas: 'Agrega al menos un producto.' });

  // 1-2: base bruta y descuento de línea
  const brutaCents: number[] = [];
  const descLineaCents: number[] = [];
  const baseTrasLineaCents: number[] = [];
  lineas.forEach((l, i) => {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0)
      throw new ValidationError({ [`lineas.${i}.cantidad`]: 'La cantidad debe ser un entero mayor que 0.' });
    if (!(l.precioUnitario >= 0))
      throw new ValidationError({ [`lineas.${i}.precioUnitario`]: 'Precio no válido.' });
    if (!(l.tasaImpuesto >= 0))
      throw new ValidationError({ [`lineas.${i}.tasaImpuesto`]: 'Tasa no válida.' });
    const bruta = Math.round(toCents(l.precioUnitario) * l.cantidad);
    const dl = descuentoEnCentavos(l.descuento, bruta, `lineas.${i}.descuento.valor`);
    brutaCents.push(bruta);
    descLineaCents.push(dl);
    baseTrasLineaCents.push(bruta - dl);
  });

  // 3: descuento de ticket prorrateado
  const sumBaseTras = baseTrasLineaCents.reduce((s, c) => s + c, 0);
  const descTicketTotalCents = descuentoEnCentavos(descuentoTicket, sumBaseTras, 'descuentoTicket.valor');
  const prorrateoCents = new Array<number>(lineas.length).fill(0);
  if (descTicketTotalCents > 0 && sumBaseTras > 0) {
    let asignado = 0;
    for (let i = 0; i < lineas.length; i++) {
      prorrateoCents[i] = Math.round((descTicketTotalCents * baseTrasLineaCents[i]) / sumBaseTras);
      asignado += prorrateoCents[i];
    }
    // residuo: repartir de a 1 centavo a las líneas de mayor baseTrasLinea (orden estable)
    let residuo = descTicketTotalCents - asignado;
    const orden = baseTrasLineaCents
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c - a.c) || (a.i - b.i))
      .map((x) => x.i);
    // Al añadir un centavo (residuo > 0) solo se usan líneas con margen:
    // baseTrasLinea - prorrateo > 0. Como el margen total tras el reparto es
    // Σ baseTrasLinea - descTicketTotal >= 0 (descTicketTotal está acotado),
    // siempre hay una línea que puede absorberlo y el bucle termina. Restar
    // (residuo < 0) solo agranda la base, no necesita guarda.
    let k = 0;
    let guard = 0;
    while (residuo !== 0) {
      const idx = orden[k % orden.length];
      const paso = residuo > 0 ? 1 : -1;
      const headroom = baseTrasLineaCents[idx] - prorrateoCents[idx];
      if (paso === 1 && headroom <= 0) {
        k++;
        guard++;
        if (guard > orden.length * 2) break;
        continue;
      }
      prorrateoCents[idx] += paso;
      residuo -= paso;
      k++;
      guard = 0;
    }
  }

  // 4-6: base neta, IVA, total por línea
  const resultLines: SaleComputeResultLine[] = lineas.map((l, i) => {
    const baseNetaCents = baseTrasLineaCents[i] - prorrateoCents[i];
    const impuestoCents = Math.round((baseNetaCents * l.tasaImpuesto));
    return {
      variantId: l.variantId,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      tasaImpuesto: l.tasaImpuesto,
      baseBruta: fromCents(brutaCents[i]),
      descuentoLinea: fromCents(descLineaCents[i]),
      descuentoTicketProrrateado: fromCents(prorrateoCents[i]),
      baseNeta: fromCents(baseNetaCents),
      impuesto: fromCents(impuestoCents),
      total: fromCents(baseNetaCents + impuestoCents),
    };
  });

  const subtotalCents = resultLines.reduce((s, l) => s + toCents(l.baseNeta), 0);
  const impuestosCents = resultLines.reduce((s, l) => s + toCents(l.impuesto), 0);
  const totalCents = subtotalCents + impuestosCents;
  if (totalCents <= 0)
    throw new ValidationError(
      { _form: 'El total de la venta debe ser mayor que 0.' },
      'El total de la venta debe ser mayor que 0.',
    );

  return {
    lineas: resultLines,
    subtotal: fromCents(subtotalCents),
    descuentoLineas: fromCents(descLineaCents.reduce((s, c) => s + c, 0)),
    descuentoTicket: fromCents(descTicketTotalCents),
    impuestos: fromCents(impuestosCents),
    total: fromCents(totalCents),
  };
}

export function prorateReturnLine(
  saleLine: { cantidad: number; baseNeta: number; impuesto: number; total: number },
  cantidadDevuelta: number,
): { baseNeta: number; impuesto: number; total: number } {
  if (!Number.isInteger(cantidadDevuelta) || cantidadDevuelta <= 0)
    throw new ValidationError({ cantidad: 'La cantidad debe ser un entero mayor que 0.' });
  if (cantidadDevuelta > saleLine.cantidad)
    throw new ValidationError({ cantidad: `Máximo devolvible: ${saleLine.cantidad}.` });
  if (cantidadDevuelta === saleLine.cantidad)
    return { baseNeta: saleLine.baseNeta, impuesto: saleLine.impuesto, total: saleLine.total };
  const frac = cantidadDevuelta / saleLine.cantidad;
  const baseNeta = round2(saleLine.baseNeta * frac);
  const impuesto = round2(saleLine.impuesto * frac);
  return { baseNeta, impuesto, total: round2(baseNeta + impuesto) };
}
