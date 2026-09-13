import { db } from '@/lib/db';

export function precioConImpuesto(base: number, tasa: number): number {
  return Math.round(base * (1 + tasa) * 100) / 100;
}

export async function getTaxRates(): Promise<{
  id: string;
  nombre: string;
  tasa: number;
  esDefault: boolean;
}[]> {
  const rates = await db.taxRate.findMany({
    where: { activa: true },
    orderBy: [{ esDefault: 'desc' }, { tasa: 'desc' }],
  });
  return rates.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tasa: Number(r.tasa),
    esDefault: r.esDefault,
  }));
}

export async function getDefaultTaxRate(): Promise<{
  id: string;
  nombre: string;
  tasa: number;
}> {
  const rates = await getTaxRates();
  if (rates.length === 0) {
    throw new Error('No hay tasas de impuesto configuradas');
  }
  const defaultRate = rates.find((r) => r.esDefault);
  const rate = defaultRate || rates[0];
  return {
    id: rate.id,
    nombre: rate.nombre,
    tasa: rate.tasa,
  };
}
