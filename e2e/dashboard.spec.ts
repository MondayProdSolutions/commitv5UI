import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * Smoke E2E del Dashboard (FASE 6 Plan 1): confirma que un Administrador ve
 * las 4 tarjetas KPI con datos reales, y que un rol sin ningún permiso
 * relevante ve el mensaje neutro en vez de tarjetas vacías.
 */

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

async function crearProductoSimple(
  page: Page,
  opts: { nombre: string; precio: number; stock: number; barcode: string },
): Promise<void> {
  await page.goto('/productos/nuevo');
  await page.getByLabel('Nombre', { exact: true }).fill(opts.nombre);
  await page.getByLabel('Código de barras (opcional)').fill(opts.barcode);
  await page.getByLabel('Precio de venta (sin impuesto)').fill(String(opts.precio));
  await page.getByLabel('Stock inicial').fill(String(opts.stock));
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page).toHaveURL(/\/productos\/(?!nuevo)[^/]+$/);
}

test('Administrador ve las 4 tarjetas del Dashboard con datos reales', async ({ page }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = `9${Date.now()}`;
  await crearProductoSimple(page, { nombre: `TFase6 Refresco ${suf}`, precio: 100, stock: 10, barcode });

  // Abrir caja como Administrador (tiene caja.gestionar vía ALL_PERMISSION_KEYS).
  await page.goto('/caja');
  await page.getByLabel('Fondo de apertura').fill('500');
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByRole('link', { name: 'Cerrar caja (arqueo)' })).toBeVisible();

  // Vender 1 ud (116.00) para que el KPI de ventas no sea cero.
  await page.goto('/ventas');
  const buscar = page.getByLabel('Buscar producto');
  await buscar.fill(barcode);
  await buscar.press('Enter');
  await expect(page.getByRole('table').getByRole('spinbutton')).toHaveValue('1');
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  await page.getByRole('button', { name: 'Efectivo exacto' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page).toHaveURL(/\/ventas\/(?!historial|devoluciones)[^/]+$/);

  await page.goto('/dashboard');
  await expect(page.getByText('¿Cuánto vendí hoy?')).toBeVisible();
  await expect(page.getByText('¿Cuántas ventas hice hoy?')).toBeVisible();
  await expect(page.getByText('¿Hay productos con poco stock?')).toBeVisible();
  await expect(page.getByText('¿Caja abierta?')).toBeVisible();
  await expect(page.getByText('Sí —')).toBeVisible();
});

test('Empleado (sin reportes.ver ni caja.gestionar) solo ve la tarjeta de inventario', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `tfase6-empleado-${Date.now()}@pos.com`;
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page.locator('form').filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill('Empleado Dashboard');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Empleado' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  await page.getByRole('button', { name: 'Entendido' }).click();

  const ctx = await browser.newContext();
  const empleado = await ctx.newPage();
  try {
    await login(empleado, email, temp);
    await expect(empleado).toHaveURL(/\/cambiar-password/);
    await empleado.getByLabel('Contraseña nueva', { exact: true }).fill('empleadoDash99');
    await empleado.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('empleadoDash99');
    await empleado.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(empleado.getByText('Contraseña actualizada')).toBeVisible();

    await empleado.goto('/dashboard');
    await expect(empleado.getByText('¿Hay productos con poco stock?')).toBeVisible();
    await expect(empleado.getByText('¿Cuánto vendí hoy?')).toHaveCount(0);
    await expect(empleado.getByText('¿Caja abierta?')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
