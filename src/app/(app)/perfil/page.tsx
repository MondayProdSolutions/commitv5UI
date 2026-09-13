import { requireUser } from '@/lib/auth/context';
import { validateSession, SESSION_COOKIE } from '@/lib/auth/session';
import { listUserSessions } from '@/lib/users/profile';
import { cookies } from 'next/headers';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { db } from '@/lib/db';
import ProfileForm from './ProfileForm';
import SessionsList from './SessionsList';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const user = await requireUser();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  let currentSessionId: string | null = null;
  if (sessionToken) {
    const res = await validateSession(sessionToken, await getIdleTimeoutMinutes());
    if (res.status === 'ok' && res.session) {
      currentSessionId = res.session.id;
    }
  }

  // Get full user data including telefono
  const fullUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });

  const sessions = await listUserSessions(user.id, currentSessionId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-ink-muted">Gestiona tu información personal y sesiones activas</p>
      </div>

      <div className="bg-surface shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium leading-6 text-ink mb-4">Información personal</h2>
          <ProfileForm defaultValues={{ nombre: fullUser.nombre, email: fullUser.email, telefono: fullUser.telefono }} />
          <div className="mt-4">
            <a
              href="/cambiar-password"
              className="text-accent-blue hover:text-accent-blue font-medium"
            >
              Cambiar contraseña
            </a>
          </div>
        </div>
      </div>

      <div className="bg-surface shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium leading-6 text-ink mb-4">Sesiones activas</h2>
          <SessionsList sessions={sessions} currentSessionId={currentSessionId} />
        </div>
      </div>

      <div className="bg-surface shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <a
            href="/perfil/actividad"
            className="text-accent-blue hover:text-accent-blue font-medium"
          >
            Ver historial de actividad →
          </a>
        </div>
      </div>
    </div>
  );
}
