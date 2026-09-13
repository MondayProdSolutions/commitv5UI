import { test, expect, type Page, type Browser, type Locator } from '@playwright/test';
import { doSetup, login, abrirCaja } from './helpers';

/**
 * E2E del Bloque 4 (Ventas) — spec §6.5.
 *
 * Cada test es autocontenido: `doSetup` deja una sesión de Administrador que
 * SIEMBRA los productos que el caso necesita **vía la UI** (`/productos/nuevo`,
 * y `/categorias` para el caso de rejilla) — `e2e/helpers.ts` no ofrece siembra
 * de catálogo, así que se reutiliza el mismo patrón que `productos-inventario`.
 * El Administrador crea también el usuario por rol (Cajero / Gerente); el
 * escenario se ejecuta en un contexto de navegador nuevo, ya logueado como ese
 * rol. Los datos son únicos por corrida (`sufijo()` en nombres, `codigoBarras()`
 * numérico único) para que las aserciones no choquen en la base efímera
 * compartida (workers: 1). Cada caso crea su propio producto, de modo que las
 * aserciones de stock no dependen del orden de ejecución.
 *
 * Aritmética base (tasa por defecto IVA 16 % = 0.16, precio sin impuesto 100):
 *   - 1 ud  → subtotal 100.00 · IVA 16.00 · total 116.00
 *   - 2 uds → subtotal 200.00 · IVA 32.00 · total 232.00
 *   - 3 uds → subtotal 300.00 · IVA 48.00 · total 348.00
 *   - 3 uds − 10 % ticket → base neta 270.00 · IVA 43.20 · total 313.20
 *   - devolver 1 de 3 → prorrateo 1/3 → 100.00 + 16.00 = 116.00
 */

// --- helpers de datos --------------------------------------------------------

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** Código de barras numérico, único por corrida. */
function codigoBarras(): string {
  return `7${Date.now()}${Math.floor(Math.random() * 100)}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fila (`<div>` con `<dt>/<dd>`) hija directa de `dl` cuyo texto empieza por `re`. */
function row(dl: Locator, re: RegExp): Locator {
  return dl.locator('> div').filter({ hasText: re });
}

/** El `<dl>` dentro de la `Section` cuyo `<h2>` es `titulo` (detalle de venta/devolución). */
function seccionDl(page: Page, titulo: string): Locator {
  return page
    .locator('div.rounded-lg')
    .filter({ has: page.getByRole('heading', { name: titulo }) })
    .locator('dl');
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

async function crearCategoriaRaiz(page: Page, nombre: string): Promise<void> {
  await page.goto('/categorias');
  await page.getByRole('button', { name: 'Nueva categoría raíz' }).click();
  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill(nombre);
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Categoría creada correctamente.')).toBeVisible();
  // El modal es un overlay `fixed`; la siguiente navegación lo descarta.
}

async function crearProductoConVariantes(
  page: Page,
  opts: {
    nombre: string;
    categoria: string;
    precio: number;
    stock: number;
    variantes: [string, string];
  },
): Promise<{ productId: string }> {
  await page.goto('/productos/nuevo');
  await expect(page).toHaveURL(/\/productos\/nuevo$/);
  await page.getByLabel('Nombre', { exact: true }).fill(opts.nombre);
  await page.getByLabel('Categoría (opcional)').selectOption({ label: opts.categoria });
  await page.getByRole('button', { name: 'Producto con variantes' }).click();

  const nombres = page.getByLabel('Nombre de la variante');
  const precios = page.getByLabel('Precio de venta (sin impuesto)');
  const stocks = page.getByLabel('Stock inicial');
  for (let i = 0; i < 2; i++) {
    await nombres.nth(i).fill(opts.variantes[i]);
    await precios.nth(i).fill(String(opts.precio));
    await stocks.nth(i).fill(String(opts.stock));
  }
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
 * Arma un carrito escaneando `barcode` `unidades` veces y cobra.
 * `pagoEfectivo` fija un único pago EFECTIVO (para sobrepago); si se omite usa
 * "Efectivo exacto". Devuelve el id de la venta tras aterrizar en `/ventas/<id>`.
 */
async function armarYCobrar(
  page: Page,
  opts: { barcode: string; unidades: number; pagoEfectivo?: number },
): Promise<string> {
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

  const saleForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Confirmar venta' }) });
  if (opts.pagoEfectivo != null) {
    await page.getByRole('button', { name: 'Añadir pago' }).click();
    await saleForm.locator('input[type="number"]').first().fill(String(opts.pagoEfectivo));
  } else {
    await page.getByRole('button', { name: 'Efectivo exacto' }).click();
  }
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page).toHaveURL(/\/ventas\/(?!historial|devoluciones)[^/]+$/);
  return page.url().split('/').pop() as string;
}

// ---------------------------------------------------------------------------
// 1. Venta con lector: folio, total, IVA, cambio y descuento de stock.
// ---------------------------------------------------------------------------
test('venta con lector de código de barras: folio V-…, total/IVA/cambio y stock -2', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  const { productId } = await crearProductoSimple(page, {
    nombre: `Refresco ${suf}`,
    precio: 100,
    stock: 20,
    barcode,
  });

  const email = `cajero-lector-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Lector', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);

    // Escanea dos veces → línea con cantidad 2. Sobrepago en efectivo (300 > 232).
    const saleId = await armarYCobrar(caja, { barcode, unidades: 2, pagoEfectivo: 300 });
    expect(saleId).not.toBe('');

    await expect(caja.getByRole('heading', { name: /Venta V-\d{6}/ })).toBeVisible();

    const totales = seccionDl(caja, 'Totales');
    await expect(row(totales, /^Subtotal/).getByRole('definition')).toHaveText('$200.00');
    await expect(row(totales, /^IVA/).getByRole('definition')).toHaveText('$32.00');
    await expect(row(totales, /^Total/).getByRole('definition')).toHaveText('$232.00');

    const pagos = seccionDl(caja, 'Pagos');
    await expect(row(pagos, /^Efectivo/).getByRole('definition')).toHaveText('$300.00');
    // Cambio = sobrepago − total = 300.00 − 232.00.
    await expect(row(pagos, /^Cambio/).getByRole('definition')).toHaveText('$68.00');

    // El stock de la variante bajó exactamente 2 (20 → 18).
    await caja.goto(`/productos/${productId}`);
    await expect(caja.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('18');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Venta por rejilla + variante + descuento de ticket (Gerente).
// ---------------------------------------------------------------------------
test('venta por rejilla con variante y 10 % de descuento de ticket (Gerente)', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const catNombre = `Bebidas ${suf}`;
  await crearCategoriaRaiz(page, catNombre);

  const v1 = `Chico ${suf}`;
  const v2 = `Grande ${suf}`;
  await crearProductoConVariantes(page, {
    nombre: `Jugo ${suf}`,
    categoria: catNombre,
    precio: 100,
    stock: 40,
    variantes: [v1, v2],
  });

  const email = `gerente-rejilla-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Gerente', 'Gerencia Rejilla', email);
  const { ctx, page: ger } = await entrarComo(browser, email, temp, 'gerenteSegura99');
  try {
    await abrirCaja(ger, 1000);
    await ger.goto('/ventas');

    // Rejilla: categoría raíz → producto → variante (modal VariantPicker).
    await ger.getByRole('button', { name: catNombre }).click();
    const prodBtn = ger.getByRole('button', { name: `Jugo ${suf}` });
    await expect(prodBtn).toBeVisible();
    await prodBtn.click();
    const modal = ger.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: new RegExp(escapeRe(v1)) }).click();
    await expect(ger.getByRole('dialog')).toHaveCount(0);

    // Cantidad 3.
    const qty = ger.getByRole('table').getByRole('spinbutton');
    await qty.fill('3');
    await expect(qty).toHaveValue('3');

    // 10 % de descuento de ticket.
    await ger.getByRole('button', { name: 'Añadir descuento' }).click();
    await ger.getByLabel('Tipo').selectOption('porcentaje');
    await ger.getByLabel('Valor').fill('10');
    await ger.getByRole('button', { name: 'Aplicar' }).click();

    // TotalsPanel: "Subtotal" muestra la base BRUTA (300.00 = 270.00 neto + 30.00
    // de descuento, ver `TotalsPanel.tsx`), e IVA sobre la base neta (270.00 × 0.16).
    const totals = ger.locator('dl').filter({ has: ger.getByText('Subtotal') });
    await expect(row(totals, /^Subtotal/).getByRole('definition')).toHaveText('$300.00');
    await expect(row(totals, /^Descuentos/).getByRole('definition')).toContainText('$30.00');
    await expect(row(totals, /^IVA/).getByRole('definition')).toHaveText('$43.20');
    await expect(row(totals, /^Total/).getByRole('definition')).toHaveText('$313.20');

    // Cobro mixto: TARJETA 150 + EFECTIVO 200 = 350 ≥ 313.20.
    await ger.getByRole('button', { name: /^Cobrar/ }).click();
    const saleForm = ger
      .locator('form')
      .filter({ has: ger.getByRole('button', { name: 'Confirmar venta' }) });
    await ger.getByRole('button', { name: 'Añadir pago' }).click();
    await ger.getByRole('button', { name: 'Añadir pago' }).click();
    await saleForm.getByRole('button', { name: 'Tarjeta' }).first().click();
    await saleForm.locator('input[type="number"]').nth(0).fill('150');
    await saleForm.locator('input[type="number"]').nth(1).fill('200');
    await ger.getByRole('button', { name: 'Confirmar venta' }).click();

    await expect(ger).toHaveURL(/\/ventas\/(?!historial|devoluciones)[^/]+$/);
    await expect(ger.getByRole('heading', { name: /Venta V-\d{6}/ })).toBeVisible();

    const totalesD = seccionDl(ger, 'Totales');
    // Igual que en el TotalsPanel del cajero: "Subtotal" es la base bruta (300.00).
    await expect(row(totalesD, /^Subtotal/).getByRole('definition')).toHaveText('$300.00');
    await expect(row(totalesD, /^Descuentos/).getByRole('definition')).toContainText('$30.00');
    await expect(row(totalesD, /^IVA/).getByRole('definition')).toHaveText('$43.20');
    await expect(row(totalesD, /^Total/).getByRole('definition')).toHaveText('$313.20');

    const pagosD = seccionDl(ger, 'Pagos');
    await expect(row(pagosD, /^Tarjeta/).getByRole('definition')).toHaveText('$150.00');
    await expect(row(pagosD, /^Efectivo/).getByRole('definition')).toHaveText('$200.00');
    await expect(row(pagosD, /^Cambio/).getByRole('definition')).toHaveText('$36.80');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 3. El Cajero no ve los controles de descuento en `/ventas`.
// ---------------------------------------------------------------------------
test('el cajero no ve los controles de descuento en el punto de venta', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Galleta ${suf}`, precio: 100, stock: 15, barcode });

  const email = `cajero-desc-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Desc', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);
    await caja.goto('/ventas');

    // El control de descuento de ticket no está presente.
    await expect(caja.getByText('Descuento al ticket')).toHaveCount(0);
    await expect(caja.getByRole('button', { name: 'Añadir descuento' })).toHaveCount(0);

    // Con una línea en el carrito, la columna "Descuento" tampoco aparece…
    const buscar = caja.getByLabel('Buscar producto');
    await buscar.fill(barcode);
    await buscar.press('Enter');
    await expect(caja.getByRole('table').getByRole('spinbutton')).toHaveValue('1');
    await expect(caja.getByRole('columnheader', { name: 'Descuento' })).toHaveCount(0);

    // …pero la tabla sí se renderizó con sus columnas normales.
    await expect(caja.getByRole('columnheader', { name: 'Cantidad' })).toBeVisible();
    await expect(caja.getByRole('columnheader', { name: 'Importe' })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 4. Pago insuficiente: error visible, sin redirección, carrito intacto.
// ---------------------------------------------------------------------------
test('pago insuficiente: muestra error, no redirige y conserva el carrito', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  const nombre = `Chocolate ${suf}`;
  await crearProductoSimple(page, { nombre, precio: 100, stock: 15, barcode });

  const email = `cajero-pago-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Pago', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);
    await caja.goto('/ventas');
    const buscar = caja.getByLabel('Buscar producto');
    await buscar.fill(barcode);
    await buscar.press('Enter');
    await expect(caja.getByRole('table').getByRole('spinbutton')).toHaveValue('1');

    const cobrar = caja.getByRole('button', { name: /^Cobrar/ });
    await expect(cobrar).toBeEnabled();
    await cobrar.click();

    const saleForm = caja
      .locator('form')
      .filter({ has: caja.getByRole('button', { name: 'Confirmar venta' }) });
    await caja.getByRole('button', { name: 'Añadir pago' }).click();
    await saleForm.locator('input[type="number"]').first().fill('50'); // < 116.00
    await caja.getByRole('button', { name: 'Confirmar venta' }).click();

    // Error visible, sigue en `/ventas` (sin redirección) y el carrito intacto.
    await expect(caja.getByText('El pago no cubre el total.')).toBeVisible();
    await expect(caja).toHaveURL(/\/ventas$/);
    await expect(caja.getByRole('table').getByRole('spinbutton')).toHaveValue('1');
    await expect(caja.getByRole('cell', { name: new RegExp(escapeRe(nombre)) })).toBeVisible();
    await expect(caja.getByRole('button', { name: 'Confirmar venta' })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 5. Cancelación el mismo día (Gerente): estado Cancelada + stock reintegrado.
// ---------------------------------------------------------------------------
test('cancelación el mismo día (Gerente): estado Cancelada y stock reintegrado', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  const { productId } = await crearProductoSimple(page, {
    nombre: `Agua ${suf}`,
    precio: 100,
    stock: 30,
    barcode,
  });

  const email = `gerente-cancel-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Gerente', 'Gerencia Cancel', email);
  const { ctx, page: ger } = await entrarComo(browser, email, temp, 'gerenteSegura99');
  try {
    await abrirCaja(ger, 1000);

    const saleId = await armarYCobrar(ger, { barcode, unidades: 2 });

    // Stock tras la venta: 30 → 28.
    await ger.goto(`/productos/${productId}`);
    await expect(ger.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('28');

    await ger.goto(`/ventas/${saleId}`);
    await ger.getByLabel('Motivo de la cancelación').fill('Cobro duplicado por error');
    await ger.getByRole('button', { name: 'Cancelar venta' }).click();
    await ger.getByRole('dialog').getByRole('button', { name: 'Cancelar venta' }).click();

    // `cancelarVentaAction` hace `revalidatePath`: la página vuelve a renderizar
    // con estado CANCELADA, sin el formulario de cancelación.
    await expect(ger.getByRole('button', { name: 'Cancelar venta' })).toHaveCount(0);
    await expect(ger.getByText('Cancelada', { exact: true }).first()).toBeVisible();
    await expect(ger.getByText('Cobro duplicado por error')).toBeVisible();

    // Stock reintegrado al valor previo a la venta (28 → 30).
    await ger.goto(`/productos/${productId}`);
    await expect(ger.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('30');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Devolución parcial (Cajero): total prorrateado, stock +1 y tope de cantidad.
// ---------------------------------------------------------------------------
test('devolución parcial (Cajero): total prorrateado 1/3, stock +1 y máximo devolvible 2', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  const { productId } = await crearProductoSimple(page, {
    nombre: `Dulce ${suf}`,
    precio: 100,
    stock: 30,
    barcode,
  });

  const email = `cajero-dev-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Dev', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    await abrirCaja(caja, 1000);
    const saleId = await armarYCobrar(caja, { barcode, unidades: 3 });

    // Stock tras vender 3: 30 → 27.
    await caja.goto(`/productos/${productId}`);
    await expect(caja.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('27');

    // Devolver 1 de 3. El input de cantidad no tiene aria-label (Task 13):
    // se selecciona por rol `spinbutton` (única línea).
    await caja.goto(`/ventas/${saleId}/devolucion`);
    await caja.getByRole('spinbutton').first().fill('1');
    await caja.getByLabel('Método de reembolso').selectOption('EFECTIVO');
    await caja.getByLabel('Motivo').fill('El cliente devolvió una unidad');
    await caja.getByRole('button', { name: 'Confirmar devolución' }).click();

    await expect(caja).toHaveURL(/\/ventas\/devoluciones\/[^/]+$/);
    await expect(caja.getByRole('heading', { name: /Devolución D-\d{6}/ })).toBeVisible();

    // Total prorrateado 1/3 de 348.00 → 100.00 + 16.00 = 116.00.
    const reembolso = seccionDl(caja, 'Reembolso');
    await expect(row(reembolso, /^Total reembolsado/).getByRole('definition')).toHaveText('$116.00');

    // Stock: subió 1 (27 → 28).
    await caja.goto(`/productos/${productId}`);
    await expect(caja.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('28');

    // Reintento: ya sólo quedan 2 devolvibles → el input topa en `max=2`.
    await caja.goto(`/ventas/${saleId}/devolucion`);
    const qty = caja.getByRole('spinbutton').first();
    await expect(qty).toHaveAttribute('max', '2');
    await qty.fill('3');
    await expect(qty).toHaveValue('2');
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 7. Ticket imprimible: folio + TOTAL + CAMBIO, fuera del app shell.
// ---------------------------------------------------------------------------
test('el ticket imprimible contiene folio, TOTAL y CAMBIO y no lleva barra lateral', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = codigoBarras();
  await crearProductoSimple(page, { nombre: `Pan ${suf}`, precio: 100, stock: 12, barcode });

  const email = `cajero-ticket-${Date.now()}@pos.com`;
  const temp = await crearUsuario(page, 'Cajero', 'Caja Ticket', email);
  const { ctx, page: caja } = await entrarComo(browser, email, temp, 'ventaSegura99');
  try {
    // `PrintOnMount` llama a `window.print()`; en headless no bloquea, pero se
    // desactiva cualquier diálogo por si acaso.
    caja.on('dialog', (d) => {
      void d.dismiss().catch(() => undefined);
    });

    await abrirCaja(caja, 1000);
    const saleId = await armarYCobrar(caja, { barcode, unidades: 1 });

    await caja.goto(`/ventas-ticket/${saleId}`);
    await expect(caja.getByText(/V-\d{6}/)).toBeVisible();
    await expect(caja.getByText('TOTAL', { exact: true })).toBeVisible();
    await expect(caja.getByText('CAMBIO', { exact: true })).toBeVisible();
    await expect(caja.getByText('$116.00').first()).toBeVisible(); // importe del total
    // Está fuera del app shell: no hay navegación lateral.
    await expect(caja.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
