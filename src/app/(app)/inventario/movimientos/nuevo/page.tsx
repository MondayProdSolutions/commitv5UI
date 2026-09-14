import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { permisoParaTipo, type MovementTipo } from '@/lib/inventory/movement-perms';
import { MovementForm } from './MovementForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

type SearchParams = { variantId?: string };

const TODOS_TIPOS = ['ENTRADA', 'SALIDA', 'AJUSTE'] as const satisfies readonly MovementTipo[];

export default async function NuevoMovimientoPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderNuevoMovimientoPage(props));
}

async function renderNuevoMovimientoPage(props: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Se calcula en memoria con `can` (sin efectos): así un usuario con un rol
  // que sólo tiene un subconjunto de permisos no genera filas `auth.forbidden`.
  const allowed = TODOS_TIPOS.filter((t) => can(user, permisoParaTipo(t)));

  if (allowed.length === 0) {
    // Ninguno de los 3 permisos: dispara la pantalla 403 estándar y deja
    // una única fila `auth.forbidden` deliberada.
    await requirePermission('inventario.entrada');
  }

  const sp = await props.searchParams;
  const initialVariantId = sp.variantId?.trim() || undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Registrar movimiento</h1>
          <p className="text-ink-muted">Entrada, salida o ajuste de stock de una variante.</p>
        </div>
        <Link
          href="/inventario/movimientos"
          className="text-sm text-ink-subtle hover:text-ink"
        >
          ← Volver al historial
        </Link>
      </div>

      <MovementForm allowedTipos={allowed} initialVariantId={initialVariantId} />
    </div>
  );
}
