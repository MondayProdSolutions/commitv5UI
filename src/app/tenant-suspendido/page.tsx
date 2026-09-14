export default function TenantSuspendido() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Esta cuenta está suspendida</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Contacta a soporte para reactivarla.
        </p>
      </div>
    </div>
  );
}
