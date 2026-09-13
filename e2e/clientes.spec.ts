import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * E2E del Bloque 3 (Clientes).
 *
 * Cada test es autocontenido: `doSetup` deja una sesión de Administrador y cada
 * caso genera sus propios datos únicos (`sufijo()` en el nombre, `telefonoRnd()`
 * de 10 dígitos), de modo que las aserciones sobre el listado nunca chocan entre
 * tests aunque compartan la base efímera (workers: 1). No hay acoplamiento por
 * orden de ejecución: cada test crea lo que necesita.
 */

/** Sufijo aleatorio estable para nombres. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

/** Teléfono de 10 dígitos, único por corrida (6 del reloj + 4 aleatorios). */
function telefonoRnd(): string {
  const base = (Date.now() % 1_000_000).toString().padStart(6, '0');
  const cola = Math.floor(1000 + Math.random() * 9000).toString();
  return base + cola;
}

/**
 * Alta de un cliente sólo con datos de contacto (sección CFDI vacía).
 * Devuelve el id del cliente ya en su detalle.
 */
async function altaClienteContacto(
  page: Page,
  nombre: string,
  telefono: string,
): Promise<string> {
  await page.goto('/clientes');
  await page.getByRole('link', { name: 'Nuevo cliente' }).click();
  await expect(page).toHaveURL(/\/clientes\/nuevo$/);

  await page.getByLabel('Nombre *').fill(nombre);
  await page.getByLabel('Teléfono').fill(telefono);
  await page.getByRole('button', { name: 'Crear cliente' }).click();

  await expect(page).toHaveURL(/\/clientes\/(?!nuevo)[^/]+$/);
  return page.url().split('/').pop() as string;
}

/** Abre la fila del listado que contiene `texto` y espera el detalle. */
async function abrirFila(page: Page, texto: string): Promise<void> {
  const row = page.locator('tbody tr', { hasText: texto });
  await expect(row).toBeVisible();
  // `CustomerRow` navega por `onClick` (componente cliente); reintenta hasta que
  // la hidratación haya enganchado el handler.
  await expect(async () => {
    await row.click();
    await expect(page).toHaveURL(/\/clientes\/(?!nuevo)[^/]+$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Crea un usuario con rol Cajero y devuelve su contraseña temporal (12 chars). */
async function crearCajero(page: Page, nombre: string, email: string): Promise<string> {
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();

  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill(nombre);
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Cajero' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();

  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  expect(temp).toHaveLength(12);
  await page.getByRole('button', { name: 'Entendido' }).click();
  return temp;
}

test('alta de cliente no facturable', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const nombre = `María López ${sufijo()}`;
  const id = await altaClienteContacto(page, nombre, telefonoRnd());
  expect(id).not.toBe('nuevo');

  // El detalle es el del cliente recién creado y NO tiene el badge "Facturable".
  await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
  await expect(page.getByText('Facturable', { exact: true })).toHaveCount(0);

  // En el listado la fila aparece con Facturable = "No" y estado "Activo".
  await page.goto(`/clientes?q=${encodeURIComponent(nombre)}`);
  const row = page.locator('tbody tr', { hasText: nombre });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(4)).toHaveText('No');
  await expect(row.locator('td').nth(5)).toHaveText('Activo');
});

test('completar datos fiscales deja al cliente facturable', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const nombre = `María López ${sufijo()}`;
  const id = await altaClienteContacto(page, nombre, telefonoRnd());

  await page.goto(`/clientes/${id}`);
  await page.getByRole('button', { name: /Datos de facturación/ }).click();
  await page.getByLabel('RFC').fill('LOAM8001011X3');
  await page.getByLabel('Razón social').fill('Maria Lopez');
  await page.getByLabel('Régimen fiscal').selectOption('612');
  await page.getByLabel('Uso de CFDI').selectOption('G03');
  await page.getByLabel('Código postal fiscal').fill('06000');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();

  // Recargar: los datos persisten y el cliente ya es facturable.
  await page.reload();
  await expect(page.getByLabel('RFC')).toHaveValue('LOAM8001011X3');
  await expect(page.getByLabel('Razón social')).toHaveValue('Maria Lopez');
  await expect(page.getByText('Facturable', { exact: true })).toBeVisible();

  // El listado refleja Facturable = "Sí" y el RFC.
  await page.goto(`/clientes?q=${encodeURIComponent(nombre)}`);
  const row = page.locator('tbody tr', { hasText: nombre });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(3)).toHaveText('LOAM8001011X3');
  await expect(row.locator('td').nth(4)).toHaveText('Sí');
});

test('el teléfono es único: alta duplicada muestra error de campo', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const telefono = telefonoRnd();
  // Primer cliente con ese teléfono: se crea sin problema.
  await altaClienteContacto(page, `María López ${sufijo()}`, telefono);

  // Segundo cliente con el MISMO teléfono: error de campo, sin navegación.
  await page.goto('/clientes/nuevo');
  await page.getByLabel('Nombre *').fill(`Otro Cliente ${sufijo()}`);
  await page.getByLabel('Teléfono').fill(telefono);
  await page.getByRole('button', { name: 'Crear cliente' }).click();

  await expect(page.getByText('Ya está en uso.')).toBeVisible();
  await expect(page).toHaveURL(/\/clientes\/nuevo$/);
});

test('el cliente genérico "Público en General" está protegido', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  await page.goto('/clientes');
  // Es SIEMPRE la primera fila del listado.
  await expect(page.locator('tbody tr').first()).toContainText('Público en General');

  await abrirFila(page, 'Público en General');
  await expect(page.getByRole('heading', { level: 1, name: 'Público en General' })).toBeVisible();

  // No hay acción de archivar.
  await expect(page.getByRole('button', { name: /Archivar/ })).toHaveCount(0);
  await expect(page.getByText('Archivar cliente')).toHaveCount(0);

  // El nombre y la sección CFDI están bloqueados.
  await expect(page.getByLabel('Nombre *')).not.toBeEditable();
  await expect(page.getByLabel('RFC')).toBeDisabled();
  await expect(page.getByLabel('Razón social')).toBeDisabled();
  await expect(page.getByLabel('RFC')).toHaveValue('XAXX010101000');

  // "Notas" SÍ es editable y se guarda.
  const nota = `Nota E2E ${sufijo()}`;
  await page.getByLabel('Notas').fill(nota);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Notas')).toHaveValue(nota);
});

test('un cajero puede crear clientes pero no editarlos ni archivarlos', async ({ page, browser }) => {
  test.setTimeout(150_000);
  await doSetup(page);

  // Admin: crea el cajero y un cliente objetivo que el cajero intentará editar.
  const email = `cajero-clientes-${Date.now()}@pos.com`;
  const temp = await crearCajero(page, 'Caja Clientes', email);
  const objetivoNombre = `Cliente Admin ${sufijo()}`;
  const objetivoId = await altaClienteContacto(page, objetivoNombre, telefonoRnd());

  const ctx = await browser.newContext();
  try {
    const cajero = await ctx.newPage();
    await login(cajero, email, temp);
    await expect(cajero).toHaveURL(/\/cambiar-password/);
    await cajero.getByLabel('Contraseña nueva', { exact: true }).fill('cajaSegura99');
    await cajero.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('cajaSegura99');
    await cajero.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(cajero.getByText('Contraseña actualizada')).toBeVisible();

    // El cajero VE el listado y el botón de alta.
    await cajero.goto('/clientes');
    await expect(cajero.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
    await expect(cajero.getByRole('link', { name: 'Nuevo cliente' })).toBeVisible();

    // El cajero puede crear un cliente.
    const propioNombre = `Cliente Cajero ${sufijo()}`;
    const propioId = await altaClienteContacto(cajero, propioNombre, telefonoRnd());
    expect(propioId).not.toBe('nuevo');
    await expect(cajero.getByRole('heading', { level: 1, name: propioNombre })).toBeVisible();

    // Abre el detalle de OTRO cliente: el form está en modo lectura.
    await cajero.goto(`/clientes/${objetivoId}`);
    await expect(cajero.getByRole('heading', { level: 1, name: objetivoNombre })).toBeVisible();
    await expect(cajero.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    await expect(cajero.getByLabel('Nombre *')).not.toBeEditable();
    await expect(cajero.getByLabel('Teléfono')).not.toBeEditable();

    // Y no hay ninguna acción de archivar disponible.
    await expect(cajero.getByRole('button', { name: /Archivar/ })).toHaveCount(0);
    await expect(cajero.getByText('Archivar cliente')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
