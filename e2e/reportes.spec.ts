import { test, expect, type Page, type Browser, type Locator } from '@playwright/test';
import { doSetup, login, abrirCaja } from './helpers';

/**
 * E2E del Bloque 6 (Reportes) — spec §9.
 *
 * Cada test es autocontenido: `doSetup` deja una sesión de Administrador que
 * siembra el producto y el usuario del rol necesario **vía la UI**
 * (`/productos/nuevo`, `/admin/usuarios`), igual que `e2e/caja.spec.ts` /
 * `e2e/ventas.spec.ts`. El escenario corre en un contexto de navegador nuevo,
 * ya logueado como ese rol. Datos únicos por corrida (`sufijo()`/`codigoBarras()`)
 * porque el servidor y la base efímera se comparten entre specs (`workers: 1`).
 *
 * Los reportes agregan por día natural MX sobre TODAS las sesiones de caja
 * (la sesión de caja es un recurso global — ver `src/lib/cash/sessions.ts`,
 * `findFirst({ where: { estado: 'ABIERTA' } })`), así que cada test que abre
 * caja y vende cierra su propia sesión al terminar, para no dejarla abierta
 * para el siguiente test. Las aserciones sobre KPIs/tablas de "Hoy" usan
 * cotas inferiores (`>=`) en vez de igualdad exacta: el atajo "Hoy" agrupa en
 * una sola fila todas las ventas del día, y dos tests de este mismo archivo
 * (Ventas y Margen) pueden sembrar una venta el mismo día natural.
 */

// --- helpers de datos --------------------------------------------------------

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** Código de barras numérico, único por corrida. */
function codigoBarras(): string {
  return `7${Date.now()}${Math.floor(Math.random() * 100)}`;
}

/** Convierte un texto tipo "$232.00" (o "232.00") a número. */
function parseMoney(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ''));
}

// --- helpers de siembra (como Administrador) --------------------------------

async function crearProductoSimple(
  page: Page,
  opts: { nombre: string; precio: number; stock: number; barcode: string },
): Promise<{ productId: string }> {
  await page.goto('/productos/nuevo');
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await page.getByLabel('Nombre', { exact: true }).fill(opts.nombre);
  await page.getByLabel('Código de barras (opcional)').fill(opts.barcode);
  await page.getByLabel('Precio de venta (sin impuesto)').fill(String(opts.precio));
  await page.getByLabel('Stock inicial').fill(String(opts.stock));
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page).toHaveURL(/\/productos\/(?!nuevo)[^/]+$/);
  return { productId: page.url().split('/').pop() as string };
}

/** Crea un usuario del rol pedido y devuelve su contraseña temporal (12 chars). */
async function crearUsuario(
  page: Page,
  rol: 'Cajero' | 'Gerente' | 'Empleado',
  nombre: string,
  email: string,
): Promise<string> {
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill(nombre);
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: rol });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  expect(temp).toHaveLength(12);
  await page.getByRole('button', { name: 'Entendido' }).click();
  return temp;
}

/** Nuevo contexto: inicia sesión con la temporal y cambia la contraseña forzada. */
async function entrarComo(
  browser: Browser,
  email: string,
  temp: string,
  nueva: string,
): Promise<{ ctx: Awaited<ReturnType<Browser['newContext']>>; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email, temp);
  await expect(page).toHaveURL(/\/cambiar-password/);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
  await page.getByLabel('Confirmar contraseña nueva', { exact: true }).fill(nueva);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
  return { ctx, page };
}

/**
 * Arma un carrito escaneando `barcode` `unidades` veces y cobra en efectivo
 * exacto. Devuelve el id de la venta tras aterrizar en `/ventas/<id>`.
 */
async function armarYCobrar(page: Page, opts: { barcode: string; unidades: number }): Promise<string> {
  await page.goto('/ventas');
  const buscar = page.getByLabel('Buscar producto');
  const qtyCarrito = page.getByRole('table').getByRole('spinbutton');
  for (let i = 0; i < opts.unidades; i++) {
    await buscar.fill(opts.barcode);
    await buscar.press('Enter');
    await expect(qtyCarrito).toHaveValue(String(i + 1));
  }

  const cobrar = page.getByRole('button', { name: /^Cobrar/ });
  await expect(cobrar).toBeEnabled();
  await cobrar.click();
  await page.getByRole('button', { name: 'Efectivo exacto' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page).toHaveURL(/\/ventas\/(?!historial|devoluciones)[^/]+$/);
  return page.url().split('/').pop() as string;
}

/** Cierra la caja abierta contando `efectivoContado`. Devuelve el id de la sesión cerrada. */
async function cerrarCaja(page: Page, efectivoContado: number): Promise<string> {
  await page.goto('/caja/cerrar');
  await page.getByLabel('Efectivo contado en el cajón').fill(String(efectivoContado));
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page).toHaveURL(/\/caja\/sesiones\/[^/]+$/);
  return page.url().split('/').pop() as string;
}

/** El `<p>` de valor de una `KpiCard`, hermano siguiente del `<p>` con el título exacto. */
function kpiValue(page: Page, titulo: string): Locator {
  return page.getByText(titulo, { exact: true }).locator('xpath=following-sibling::p[1]');
}

/** El `<div className="space-y-2">` (Top productos / Por cajero / Por día / Detalle) con `h2` = `titulo`. */
function seccion(page: Page, titulo: string): Locator {
  return page
    .locator('div.space-y-2')
    .filter({ has: page.getByRole('heading', { name: titulo, exact: true }) });
}

// ---------------------------------------------------------------------------
// 1. Cajero ve Ventas/Inventario/Clientes en /reportes pero no Margen; ir a
//    /reportes/margen directo por URL no muestra el contenido del reporte
//    (gate de `requirePermission('reportes.margen')`, capturado por el error
//    boundary del layout `(app)` como "No tienes permiso para ver esta página").
// ---------------------------------------------------------------------------
test('Cajero ve Ventas/Inventario/Clientes en /reportes, no Margen; /reportes/margen por URL queda bloqueado', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `cajero-rep-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Cajero Reportes', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'cajeroSegura99');
  try {
    await caja.goto('/reportes');
    await expect(caja.getByRole('heading', { name: 'Ventas', exact: true })).toBeVisible();
    await expect(caja.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
    await expect(caja.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
    await expect(caja.getByRole('heading', { name: 'Utilidad / margen' })).toHaveCount(0);

    await caja.goto('/reportes/margen');
    await expect(
      caja.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
    await expect(caja.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
    await expect(caja.getByRole('heading', { name: 'Reporte de utilidad y margen' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Empleado no ve "Reportes" en la barra lateral; acceso directo por URL a
//    /reportes también queda bloqueado (mismo gate que el escenario 1).
// ---------------------------------------------------------------------------
test('Empleado no ve "Reportes" en la navegación', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `empleado-rep-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Empleado', 'Empleado Reportes', email);
  const { ctx, page: emp } = await entrarComo(browser, email, temp, 'empleadoSegura99');
  try {
    await emp.goto('/dashboard');
    await expect(
      emp.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Reportes' }),
    ).toHaveCount(0);

    await emp.goto('/reportes');
    await expect(
      emp.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Reporte de Ventas con datos reales: vender 2 unidades hoy se refleja en
//    la tarjeta "Ventas completadas" y en la fila de "Hoy" de "Por día".
// ---------------------------------------------------------------------------
test('Reporte de Ventas con datos reales: KPIs y "Por día" reflejan la venta sembrada', async ({ page }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Reporte Ventas ${suf}`, precio: 100, stock: 20, barcode });

  await abrirCaja(page, 1000);
  const saleId = await armarYCobrar(page, { barcode, unidades: 2 }); // total 232.00
  expect(saleId).toBeTruthy();
  await cerrarCaja(page, 1232); // 1000 + 232, libera la sesión global para el siguiente test

  await page.goto('/reportes/ventas?atajo=hoy');
  await expect(page.getByRole('heading', { name: 'Reporte de ventas' })).toBeVisible();

  const ventasCompletadas = Number((await kpiValue(page, 'Ventas completadas').innerText()).trim());
  expect(ventasCompletadas).toBeGreaterThanOrEqual(1);

  const ingresoNeto = parseMoney(await kpiValue(page, 'Ingreso neto').innerText());
  expect(ingresoNeto).toBeGreaterThanOrEqual(232);

  // El atajo "Hoy" acota el período a un solo día natural MX: a lo más una fila.
  const filaHoy = seccion(page, 'Por día').locator('tbody tr');
  await expect(filaHoy).toHaveCount(1);
  const celdas = filaHoy.locator('td');
  const ventasDelDia = Number((await celdas.nth(1).innerText()).trim());
  expect(ventasDelDia).toBeGreaterThanOrEqual(1);
  const ingresoBrutoDelDia = parseMoney(await celdas.nth(2).innerText());
  expect(ingresoBrutoDelDia).toBeGreaterThanOrEqual(232);
});

// ---------------------------------------------------------------------------
// 4. El link "Exportar CSV" de Ventas apunta a /reportes/ventas/export con
//    los parámetros de período actuales, y esa ruta responde con un CSV real.
// ---------------------------------------------------------------------------
test('Exportar CSV de Ventas: href correcto y la ruta responde con un CSV real', async ({ page }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  await page.goto('/reportes/ventas?atajo=hoy');
  const link = page.getByRole('link', { name: 'Exportar CSV' });
  await expect(link).toHaveAttribute('href', '/reportes/ventas/export?atajo=hoy');

  const href = await link.getAttribute('href');
  const resp = await page.request.get(href as string);
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('text/csv');
  const body = await resp.text();
  expect(body).toContain('Fecha,Ventas,Ingreso bruto,Devoluciones,Ingreso neto,IVA');
});

// ---------------------------------------------------------------------------
// 5. Reporte de Margen para Gerente: nota de aproximación de costo visible y
//    detalle con al menos una fila (venta sembrada primero, período por defecto).
// ---------------------------------------------------------------------------
test('Reporte de Margen para Gerente: nota de aproximación y detalle con datos', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Reporte Margen ${suf}`, precio: 100, stock: 20, barcode });

  const email = `gerente-margen-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Gerente', 'Gerente Margen', email);
  const { ctx, page: ger } = await entrarComo(browser, email, temp, 'gerenteMargen99');
  try {
    await abrirCaja(ger, 1000);
    const saleId = await armarYCobrar(ger, { barcode, unidades: 2 }); // total 232.00
    expect(saleId).toBeTruthy();
    await cerrarCaja(ger, 1232);

    await ger.goto('/reportes/margen'); // período por defecto ("Este mes") incluye la venta de hoy
    await expect(ger.getByRole('heading', { name: 'Reporte de utilidad y margen' })).toBeVisible();
    await expect(
      ger.getByText('El margen usa el costo actual de cada producto (precioCompra)', { exact: false }),
    ).toBeVisible();

    const detalle = seccion(ger, 'Detalle por producto');
    await expect(detalle.getByText('Sin resultados.')).toHaveCount(0);
    const filas = await detalle.locator('tbody tr').count();
    expect(filas).toBeGreaterThanOrEqual(1);
  } finally {
    await ctx.close();
  }
});
