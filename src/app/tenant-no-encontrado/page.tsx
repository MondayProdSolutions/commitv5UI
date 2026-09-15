export default function TenantNoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Esta empresa no existe</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Verifica la dirección o contacta a quien te la compartió.
        </p>
      </div>
    </div>
  );
}
