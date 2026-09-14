export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['www', 'api', 'admin', 'app']);

/** Dado el header Host de una request, devuelve el slug del tenant, o null si es
 *  el dominio raíz, localhost sin subdominio, o una palabra reservada. */
export function resolveTenantSlug(host: string): string | null {
  const hostname = host.split(':')[0]!;
  const parts = hostname.split('.');

  // localhost:3000 -> ['localhost'] ; negocio1.localhost:3000 -> ['negocio1','localhost']
  const isLocalhost = parts[parts.length - 1] === 'localhost';
  const hasSubdomain = isLocalhost ? parts.length > 1 : parts.length > 2;
  if (!hasSubdomain) return null;

  const slug = parts[0]!;
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}
