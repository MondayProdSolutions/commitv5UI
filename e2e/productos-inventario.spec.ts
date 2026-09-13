import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * E2E del Bloque 2 (Productos / Categorías / Inventario).
 *
 * Cada test es autocontenido: `doSetup` deja una sesión de Administrador y cada
 * caso crea su propio producto con un nombre único (`Agua 1L <stamp>`), de modo
 * que las aserciones sobre listados/búsquedas nunca chocan entre tests aunque
 * compartan la misma base de datos efímera (workers: 1).
 */

/** Crea un producto SIMPLE y devuelve `{ nombre, stamp, productId }` ya en su detalle. */
async function crearProductoSimple(
  page: Page,
  precio: number,
  stockInicial: number,
): Promise<{ nombre: string; stamp: string; productId: string }> {
  const stamp = String(Date.now()) + Math.floor(Math.random() * 1000);
  const nombre = `Agua 1L ${stamp}`;

  await page.goto('/productos');
  await page.getByRole('link', { name: 'Nuevo producto' }).click();
  await expect(page).toHaveURL(/\/productos\/nuevo$/);

  await page.getByLabel('Nombre', { exact: true }).fill(nombre);
  // tipo SIMPLE ya está seleccionado por defecto; tasa por defecto (IVA 16%) también.
  await page.getByLabel('Precio de venta (sin impuesto)').fill(String(precio));
  await page.getByLabel('Stock inicial').fill(String(stockInicial));
  await page.getByRole('button', { name: 'Crear producto' }).click();

  await expect(page).not.toHaveURL(/\/nuevo$/);
  await expect(page).toHaveURL(/\/productos\/[^/]+$/);
  const productId = page.url().split('/').pop() as string;
  return { nombre, stamp, productId };
}

/** Registra un movimiento para la variante que coincide con `stamp`. */
async function registrarMovimiento(
  page: Page,
  stamp: string,
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE',
  valor: number,
  motivo: string,
): Promise<void> {
  await page.goto('/inventario/movimientos/nuevo');

  await page.getByLabel('Buscar variante').fill(stamp);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(stamp) }).click();
  await expect(page.getByText(/Variante seleccionada:/)).toBeVisible();

  await page.getByLabel('Tipo de movimiento').selectOption(tipo);
  const valorLabel = tipo === 'AJUSTE' ? 'Stock objetivo' : 'Cantidad';
  await page.getByLabel(valorLabel).fill(String(valor));
  await page.getByLabel('Motivo').fill(motivo);

  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  await expect(page).toHaveURL(/\/inventario\/movimientos$/);
}

test('alta de producto simple con stock inicial', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const { nombre, productId } = await crearProductoSimple(page, 12, 20);

  // El detalle muestra el stock de la variante.
  await expect(page.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('20');

  // El listado muestra la fila con stock total 20 y estado "Activo".
  await page.goto(`/productos?q=${encodeURIComponent(nombre)}`);
  const row = page.locator('tr', { hasText: nombre });
  await expect(row).toBeVisible();
  await expect(row).toContainText('20');
  await expect(row).toContainText('Activo');

  // sanity: el id del detalle es un id real, no "nuevo".
  expect(productId).not.toBe('nuevo');
});

test('registrar una entrada actualiza stock e historial', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const { nombre, stamp, productId } = await crearProductoSimple(page, 12, 15);

  await registrarMovimiento(page, stamp, 'ENTRADA', 10, 'compra');

  // El historial tiene 2 entradas para este producto (la del stock inicial y
  // esta): nos quedamos con la fila de la transición 15 → 25.
  const row = page
    .locator('tr')
    .filter({ hasText: nombre })
    .filter({ hasText: /15\s*→\s*25/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Entrada');
  await expect(row).toContainText('+10');
  await expect(row).toContainText('compra');

  // El detalle del producto refleja el nuevo stock.
  await page.goto(`/productos/${productId}`);
  await expect(page.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('25');
});

test('un ajuste por debajo del mínimo lo lleva a stock bajo con badge', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const { nombre, stamp, productId } = await crearProductoSimple(page, 20, 20);

  // Fijar stockMinimo = 5 en la variante (form del editor de variante, que se
  // distingue de otros forms del detalle por el botón "Guardar variante").
  await page.goto(`/productos/${productId}`);
  const variantForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Guardar variante' }) });
  await variantForm.getByLabel('Stock mínimo (0 = sin alerta)').fill('5');
  await variantForm.getByRole('button', { name: 'Guardar variante' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();

  // Ajuste con stock objetivo 2 → la variante queda en 2 (< mínimo).
  await registrarMovimiento(page, stamp, 'AJUSTE', 2, 'conteo físico');

  await page.goto(`/productos/${productId}`);
  await expect(page.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('2');

  // Aparece en Stock bajo.
  await page.goto('/inventario/stock-bajo');
  await expect(page.locator('tr', { hasText: nombre })).toBeVisible();

  // El ítem "Inventario" del sidebar muestra un badge numérico (≥ 1).
  const navInventario = page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: /Inventario/ });
  await expect(navInventario).toContainText(/[1-9][0-9]*/);
});

test('archivar un producto exige confirmación en diálogo; restaurar no', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const { productId } = await crearProductoSimple(page, 15, 5);

  // Ficha del producto.
  await page.goto(`/productos/${productId}`);

  // --- Rama CON diálogo: archivar (Recipe C1) ---
  // El trigger `type="button"` no envía el form: abre el <dialog> nativo.
  await page.getByRole('button', { name: 'Archivar producto' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('¿Archivar este producto?');

  // Confirmar DENTRO del diálogo dispara `requestSubmit()` sobre el <form action>.
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar producto' }).click();

  // Tras el revalidatePath la ficha refleja el archivado.
  await expect(page.getByRole('button', { name: 'Restaurar producto' })).toBeVisible();
  await expect(page.getByText('Archivado', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // --- Rama SIN diálogo: restaurar es inmediato ---
  await page.getByRole('button', { name: 'Restaurar producto' }).click();
  // `requestSubmit()` es asíncrono: `toHaveCount` reintenta y confirma que NO hubo diálogo.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Archivar producto' })).toBeVisible();
  await expect(page.getByText('Archivado', { exact: true })).toHaveCount(0);
});

test('un cajero sin permisos no ve las acciones de catálogo', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  // Admin crea un usuario con rol Cajero y captura la contraseña temporal.
  const email = `cajero-${Date.now()}@pos.com`;
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill('Caja Catálogo');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Cajero' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  await page.getByRole('button', { name: 'Entendido' }).click();

  // Nuevo contexto: el cajero entra y cambia la contraseña forzada.
  const ctx = await browser.newContext();
  try {
    const cajero = await ctx.newPage();
    await login(cajero, email, temp);
    await expect(cajero).toHaveURL(/\/cambiar-password/);
    await cajero.getByLabel('Contraseña nueva', { exact: true }).fill('cajaSegura99');
    await cajero.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('cajaSegura99');
    await cajero.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(cajero.getByText('Contraseña actualizada')).toBeVisible();

    // /productos carga (tiene productos.ver) pero sin acción de alta.
    await cajero.goto('/productos');
    await expect(cajero.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible();
    await expect(cajero.getByRole('link', { name: 'Nuevo producto' })).toHaveCount(0);

    // Acceso directo a rutas mutantes → pantalla "No tienes permiso".
    await cajero.goto('/productos/nuevo');
    await expect(cajero.getByText(/no tienes permiso/i)).toBeVisible();

    await cajero.goto('/inventario/movimientos/nuevo');
    await expect(cajero.getByText(/no tienes permiso/i)).toBeVisible();
  } finally {
    await ctx.close();
  }
});
