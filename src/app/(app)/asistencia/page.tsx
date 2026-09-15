import { redirect } from 'next/navigation';

/**
 * El dashboard de asistencia vive ahora en `/reportes/asistencia` (junto a
 * los demás reportes). Esta ruta se conserva solo como redirect para no
 * romper enlaces, favoritos o accesos directos existentes a `/asistencia`.
 */
export default async function AsistenciaRedirectPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/reportes/asistencia${qs ? `?${qs}` : ''}`);
}
