import { headers } from 'next/headers';
import { ForbiddenError } from '@/lib/errors';

/** Lee x-tenant-id (puesto por el proxy tras resolver el subdominio) o lanza. */
export async function requireRequestTenantId(): Promise<string> {
  const id = (await headers()).get('x-tenant-id');
  if (!id) throw new ForbiddenError('NO_TENANT', 'No se pudo resolver la empresa de esta solicitud');
  return id;
}
