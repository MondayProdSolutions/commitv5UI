This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Desarrollo

### Requisitos

- **Node.js** >= 20 (ver `.nvmrc`; se recomienda exactamente la versión 20 para máxima compatibilidad)
- **PostgreSQL**: NO necesita instalación manual — se trae automáticamente con `embedded-postgres`

### Setup inicial

1. **Copiar archivo de configuración:**
   ```bash
   cp .env.example .env
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **En una terminal, iniciar la BD local (dejar abierta):**
   ```bash
   npm run db:start
   ```
   Esto levanta PostgreSQL en puerto `54329` dentro de `.pgdata/` (persistente). La terminal se queda escuchando; abrirla en una ventana separada.

4. **En otra terminal, aplicar migraciones y datos de prueba:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000)

   **Alternativa de una sola terminal:** `npm run dev:all` levanta el
   Postgres embebido (si no está corriendo ya) y `next dev` en el mismo
   proceso — `Ctrl+C` detiene ambos. Sigue necesitando `db:migrate`/`db:seed`
   la primera vez (o después de un `db:reset`). Si prefieres control manual
   sobre la BD (por ejemplo dejarla corriendo entre varias sesiones de
   `dev`), usa el flujo de dos terminales de los pasos 3-5.

6. **Crear el primer administrador:**
   Abre [http://localhost:3000/setup](http://localhost:3000/setup) y crea la cuenta del primer administrador. Esta pantalla es de un solo uso; luego redirige a `/login`.

### Comandos principales

| Comando | Descripción |
|---------|------------|
| `npm run dev` | Servidor de desarrollo (Next.js con hot-reload) |
| `npm run dev:all` | `dev` + Postgres embebido en un solo comando/terminal (lo levanta si no está corriendo; `Ctrl+C` detiene ambos) |
| `npm run build` | Compilar para producción |
| `npm start` | Iniciar servidor compilado |
| `npm run start:all` | `start` + Postgres embebido en un solo comando (mismo mecanismo que `dev:all`; requiere `embedded-postgres` como dependencia de producción, ver nota abajo) |
| `npm run lint` | Ejecutar ESLint |
| `npm run typecheck` | Validar tipos TypeScript |
| `npm test` | Ejecutar todos los tests (unit + integration) |
| `npm run test:unit` | Solo tests unitarios |
| `npm run test:integration` | Solo tests de integración (traen su propia BD) |
| `npm run test:e2e` | Tests E2E con Playwright (requiere compilación previa) |
| `npm run db:start` | Iniciar PostgreSQL local (mantener en background) |
| `npm run db:stop` | Detener PostgreSQL local |
| `npm run db:status` | Ver estado de PostgreSQL |
| `npm run db:migrate` | Aplicar migraciones pendientes |
| `npm run db:seed` | Poblar BD con datos de semilla |
| `npm run db:reset` | Resetear BD (drop + recrear + seed) |

### Notas importantes

- **`start:all` en producción**: `embedded-postgres` hoy es `devDependency` (pensado para desarrollo/test). Si el plan de despliegue es un servidor propio administrado por el equipo (en vez de un Postgres gestionado aparte), promuévanla a dependencia de producción antes de usar `npm run start:all` ahí — es la única condición pendiente para que ese comando funcione igual en producción que en dev.
- **`.pgdata/`**: Carpeta de la BD local persistente. Puedes borrarla en cualquier momento para empezar de cero (después de `db:reset` o `db:start`).
- **`ATTENDANCE_PHOTOS_DIR`**: carpeta local donde se guardan las fotos de entrada/salida de Asistencia (por defecto `.attendance-photos`, ignorada por git).
- **Tests de integración**: No requieren `npm run db:start` — cada test levanta su propia instancia efímera de PostgreSQL en el puerto `54330`. Corren en paralelo de forma segura.
- **CI (Integración Continua)**: El workflow en `.github/workflows/ci.yml` ejecuta `lint` + `typecheck` + `test:unit` + `test:integration` en cada push/PR. Los E2E se pueden correr manualmente con `workflow_dispatch` en GitHub Actions.
- **`npm run db:seed`**: además de roles y permisos, siembra las tasas de impuesto por defecto — `IVA 16%` (tasa `0.16`, marcada como `esDefault`) y `Exento` (tasa `0`). El upsert es idempotente.

### Módulos del Bloque 2 (Productos / Categorías / Inventario)

Pantallas disponibles bajo el layout autenticado `(app)`:

| Ruta | Descripción |
|------|-------------|
| `/categorias` | Árbol de categorías de 2 niveles; alta/edición, archivado en cascada a subcategorías (con aviso de conteos), restauración. |
| `/categorias/sin-categoria-activa` | Productos cuya categoría quedó archivada; recategorización individual. |
| `/productos` | Listado con filtros (estado, categoría, texto, stock bajo, rango de precio). |
| `/productos/nuevo` | Alta de producto simple o con variantes; genera la `ENTRADA` inicial de stock. |
| `/productos/[id]` | Ficha del producto: editar precios (auditado), añadir / convertir / archivar variantes, disponibilidad, archivado. |
| `/inventario` | Panel de inventario con contador de alertas de stock bajo. |
| `/inventario/stock-bajo` | Variantes por debajo de su `stockMinimo`, ordenadas por déficit. |
| `/inventario/movimientos` | Historial paginado y filtrable de movimientos. |
| `/inventario/movimientos/nuevo` | Registro de un movimiento (ENTRADA / SALIDA / AJUSTE); valida el permiso concreto del tipo. |
| `/inventario/movimientos/export` | Descarga CSV del historial filtrado. |

**Integridad del stock:** el campo `ProductVariant.stock` sólo se modifica a través de `recordMovement` (`src/lib/inventory/movements.ts`), que es transaccional, bloquea la fila de la variante (`SELECT ... FOR UPDATE`), impide dejar stock negativo y registra el movimiento y la auditoría dentro de la misma transacción. Ningún servicio ni Server Action escribe `stock` con un valor calculado directamente (los `create` de variante lo fijan en `0` y el stock real entra por un movimiento).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
