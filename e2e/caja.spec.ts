import { test, expect, type Page, type Browser, type Locator } from '@playwright/test';
import { doSetup, login, abrirCaja } from './helpers';

/**
 * E2E del Bloque 5 (Caja) — spec §6.3.
 *
 * Cada test es autocontenido: `doSetup` deja una sesión de Administrador que
 * siembra el producto y el usuario del rol necesario **vía la UI**
 * (`/productos/nuevo`, `/admin/usuarios`), igual que `e2e/ventas.spec.ts`. El
 * escenario corre en un contexto de navegador nuevo, ya logueado como ese rol.
 * Datos únicos por corrida (`sufijo()`/`codigoBarras()`) porque el servidor y
 * la base efímera se comparten entre specs (`workers: 1`).
 *
 * Aritmética (IVA 16 %, precio sin impuesto 100 — igual que `ventas.spec.ts`):
 *   - 1 ud → total 116.00 · 2 uds → total 232.00 · 3 uds → total 348.00
 *   - devolver 1 de 3 → prorrateo 1/3 → 116.00
 */

// --- helpers de datos --------------------------------------------------------

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** Código de barras numérico, único por corrida. */
function codigoBarras(): string {
  return `7${Date.now()}${Math.floor(Math.random() * 100)}`;
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
  rol: 'Cajero' | 'Gerente',
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

/** Registra un movimiento de caja (retiro/ingreso) desde `/caja`, ya abierta. */
async function registrarMovimiento(
  page: Page,
  tipo: 'Retiro' | 'Ingreso',
  monto: number,
  motivo: string,
): Promise<void> {
  await page.goto('/caja');
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: tipo, exact: true }) });
  await form.getByLabel('Monto').fill(String(monto));
  await form.getByLabel('Motivo').fill(motivo);
  await form.getByRole('button', { name: `Registrar ${tipo.toLowerCase()}` }).click();
  await expect(page.getByText('Movimiento registrado')).toBeVisible();
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

/** Fila (`.row`) del `CorteView` cuyo primer `<span>` es exactamente `label`. */
function corteRow(page: Page, label: string): Locator {
  return page.locator('.corte .row').filter({
    has: page.locator('span', { hasText: new RegExp(`^${escapeRe(label)}$`) }),
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Segundo `<span>` de una fila del corte (el valor). */
function corteValue(page: Page, label: string): Locator {
  return corteRow(page, label).locator('span').nth(1);
}

// ---------------------------------------------------------------------------
// 1. Vender exige caja: sin sesión abierta no hay pantalla de cobro; abrir
//    caja habilita `/ventas`.
// ---------------------------------------------------------------------------
test('vender exige caja: sin sesión abierta, aviso y sin pantalla de cobro; al abrir, aparece', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `cajero-guard-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Guard', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await caja.goto('/ventas');
    await expect(caja.getByText('No hay una caja abierta.')).toBeVisible();
    const abrirLink = caja.getByRole('link', { name: 'Abrir caja' });
    await expect(abrirLink).toBeVisible();
    await expect(caja.getByLabel('Buscar producto')).toHaveCount(0);

    await abrirLink.click();
    await expect(caja).toHaveURL(/\/caja$/);
    await caja.getByLabel('Fondo de apertura').fill('1000');
    await caja.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(caja.getByRole('link', { name: 'Cerrar caja (arqueo)' })).toBeVisible();

    await caja.goto('/ventas');
    await expect(caja.getByLabel('Buscar producto')).toBeVisible();
    await expect(caja.getByText('No hay una caja abierta.')).toHaveCount(0);

    // Cierra la sesión que abrió este test para que el siguiente test no la
    // reutilice (`abrirCaja` es idempotente si ya hay una abierta) — cada test
    // es autocontenido, sin depender de lo que deja abierto un test hermano.
    await cerrarCaja(caja, 1000); // sin ventas ni movimientos: esperado = fondo
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Ciclo con arqueo cuadrado: fondo 1000, venta $232 efectivo, retiro 500,
//    cierre contando 732 → Esperado 732.00 / Contado 732.00 / Diferencia 0.00
//    badge "Cuadra"; Ventas efectivo 232.00, Retiros 500.00.
// ---------------------------------------------------------------------------
test('ciclo con arqueo cuadrado: Esperado 732.00 / Contado 732.00 / Diferencia 0.00, badge Cuadra', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Refresco ${suf}`, precio: 100, stock: 20, barcode });

  const email = `cajero-cuadra-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Cuadra', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);
    await armarYCobrar(caja, { barcode, unidades: 2 }); // total 232.00

    await registrarMovimiento(caja, 'Retiro', 500, 'depósito');

    await cerrarCaja(caja, 732); // 1000 + 232 − 500

    await expect(caja.getByText('CORTE DE CAJA', { exact: true })).toBeVisible();
    await expect(corteValue(caja, 'Esperado en efectivo')).toHaveText('$732.00');
    await expect(corteValue(caja, 'Contado')).toHaveText('$732.00');
    const badge = corteValue(caja, 'Diferencia');
    await expect(badge).toHaveText('Cuadra');
    await expect(badge).toHaveClass(/text-green-800/);

    await expect(caja.getByText('Ventas (1)')).toBeVisible();
    await expect(corteValue(caja, 'Efectivo (neto)')).toHaveText('$232.00');
    await expect(caja.getByText('Retiros ($500.00)')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Arqueo con faltante: fondo 500, venta $116 efectivo, cierre contando 600
//    → Diferencia −16.00, badge rojo "Faltante".
// ---------------------------------------------------------------------------
test('arqueo con faltante: contar 600 sobre esperado 616 → Diferencia −16.00, badge Faltante', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Galleta ${suf}`, precio: 100, stock: 20, barcode });

  const email = `cajero-faltante-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Faltante', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 500);
    await armarYCobrar(caja, { barcode, unidades: 1 }); // total 116.00

    await cerrarCaja(caja, 600); // esperado 500 + 116 = 616 → diferencia −16.00

    await expect(corteValue(caja, 'Esperado en efectivo')).toHaveText('$616.00');
    await expect(corteValue(caja, 'Contado')).toHaveText('$600.00');
    const badge = corteValue(caja, 'Diferencia');
    await expect(badge).toContainText('Faltante');
    await expect(badge).toContainText('16.00');
    await expect(badge).toHaveClass(/text-red-800/);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 4. No se abre una segunda caja: con una abierta, `/caja` muestra el panel de
//    la sesión abierta, no el formulario de apertura.
// ---------------------------------------------------------------------------
test('no se abre una segunda caja: con una abierta, /caja muestra el panel de sesión', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `cajero-segunda-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Segunda', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);

    await caja.goto('/caja');
    await expect(caja.getByRole('heading', { name: /^Caja C-/ })).toBeVisible();
    await expect(caja.getByRole('link', { name: 'Cerrar caja (arqueo)' })).toBeVisible();
    await expect(caja.getByLabel('Fondo de apertura')).toHaveCount(0);
    await expect(caja.getByRole('button', { name: 'Abrir caja' })).toHaveCount(0);

    // Cierra la sesión propia para que el siguiente test no la herede.
    await cerrarCaja(caja, 1000); // sin ventas ni movimientos: esperado = fondo
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 5. Cancelar con caja cerrada: la venta pertenece a una sesión ya cerrada →
//    "Cancelar venta" no aparece; "Registrar devolución" sí.
// ---------------------------------------------------------------------------
test('cancelar con caja cerrada: no aparece "Cancelar venta"; sí "Registrar devolución"', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Agua ${suf}`, precio: 100, stock: 20, barcode });

  const email = `gerente-cierre-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Gerente', 'Gerencia Cierre', email);
  const { ctx, page: ger } = await entrarComo(browser, email, temp, 'gerenteSegura99');
  try {
    await abrirCaja(ger, 1000);
    const saleId = await armarYCobrar(ger, { barcode, unidades: 1 }); // total 116.00
    await cerrarCaja(ger, 1116); // 1000 + 116

    await abrirCaja(ger, 500); // sesión nueva

    await ger.goto(`/ventas/${saleId}`);
    await expect(ger.getByRole('button', { name: 'Cancelar venta' })).toHaveCount(0);
    await expect(ger.getByRole('link', { name: 'Registrar devolución' })).toBeVisible();

    // Cierra también la sesión B para que el siguiente test no la herede.
    await cerrarCaja(ger, 500); // sin ventas ni movimientos en B: esperado = fondo
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Devolución sale de la caja actual: la devolución registrada en la sesión
//    B (aunque la venta sea de la sesión A, ya cerrada) descuenta el esperado
//    de B.
// ---------------------------------------------------------------------------
test('devolución sale de la caja actual: el corte de la sesión B descuenta el reembolso', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Dulce ${suf}`, precio: 100, stock: 20, barcode });

  const email = `cajero-devcaja-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja DevCaja', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000); // sesión A
    const saleId = await armarYCobrar(caja, { barcode, unidades: 3 }); // total 348.00
    await cerrarCaja(caja, 1348); // 1000 + 348, cierra A

    await abrirCaja(caja, 1000); // sesión B

    await caja.goto(`/ventas/${saleId}/devolucion`);
    await caja.getByRole('spinbutton').first().fill('1');
    await caja.getByLabel('Método de reembolso').selectOption('EFECTIVO');
    await caja.getByLabel('Motivo').fill('El cliente devolvió una unidad');
    await caja.getByRole('button', { name: 'Confirmar devolución' }).click();
    await expect(caja).toHaveURL(/\/ventas\/devoluciones\/[^/]+$/);

    // Esperado de B = 1000 (fondo) − 116 (reembolso, sin ventas en B) = 884.
    await cerrarCaja(caja, 884); // fondoB − 116

    await expect(caja.getByText('CORTE DE CAJA', { exact: true })).toBeVisible();
    await expect(corteValue(caja, 'Reembolsos en efectivo')).toHaveText('$116.00');
    await expect(corteValue(caja, 'Esperado en efectivo')).toHaveText('$884.00');
    const badge = corteValue(caja, 'Diferencia');
    await expect(badge).toHaveText('Cuadra');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 7. Corte imprimible: `/caja-corte/<id>` contiene "CORTE DE CAJA", el folio
//    C-…, "Esperado", "Diferencia", y no aparece la barra lateral.
// ---------------------------------------------------------------------------
test('el corte imprimible contiene CORTE DE CAJA, folio, Esperado y Diferencia, sin sidebar', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `cajero-imprimible-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Imprimible', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);
    await registrarMovimiento(caja, 'Ingreso', 200, 'fondo extra');
    const sessionId = await cerrarCaja(caja, 1200); // 1000 + 200

    await caja.goto(`/caja-corte/${sessionId}`);
    await expect(caja.getByText('CORTE DE CAJA', { exact: true })).toBeVisible();
    await expect(caja.getByText(/C-\d{6}/)).toBeVisible();
    await expect(caja.getByText('Esperado en efectivo')).toBeVisible();
    await expect(caja.getByText('Diferencia', { exact: true })).toBeVisible();
    await expect(caja.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 8. Enter en "Efectivo contado" no salta el diálogo de confirmación: al
//    pulsar Enter en el campo aparece el ConfirmDialog y la caja NO se cierra
//    directamente (sigue en /caja/cerrar).
// ---------------------------------------------------------------------------
test('Enter en "Efectivo contado" abre el diálogo de confirmación, no cierra la caja', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `cajero-enter-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Enter', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);

    await caja.goto('/caja/cerrar');
    const campo = caja.getByLabel('Efectivo contado en el cajón');
    await campo.fill('1000');
    await campo.press('Enter');

    // El Enter debe abrir el diálogo de confirmación, no enviar el form.
    await expect(caja.getByRole('dialog')).toBeVisible();
    await expect(caja).toHaveURL(/\/caja\/cerrar$/);

    // Y desde el diálogo sí se cierra la caja.
    await caja.getByRole('dialog').getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(caja).toHaveURL(/\/caja\/sesiones\/[^/]+$/);
  } finally {
    await ctx.close();
  }
});
