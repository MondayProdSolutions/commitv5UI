import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

const NOTICES: Record<string, string> = {
  inactividad: 'Tu sesión se cerró por inactividad.',
  sesion_cerrada: 'Tu sesión ha finalizado. Inicia sesión de nuevo.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { motivo } = await searchParams;
  const notice = typeof motivo === 'string' ? NOTICES[motivo] : undefined;

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">{notice}</p>
      ) : null}

      <LoginForm />

      <p className="text-center text-sm text-ink-subtle">
        ¿Olvidaste tu contraseña? Contacta a un administrador para restablecerla.
      </p>
    </div>
  );
}
