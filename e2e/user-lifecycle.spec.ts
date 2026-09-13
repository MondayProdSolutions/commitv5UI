import { test, expect } from '@playwright/test';
import { doSetup, login, logout } from './helpers';

async function createCajero(
  page: import('@playwright/test').Page,
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
  await dialog.getByLabel('Rol').selectOption({ label: 'Cajero' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();

  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  expect(temp).toHaveLength(12);
  await page.getByRole('button', { name: 'Entendido' }).click();
  return temp;
}

test('el admin crea un cajero, entra con la temporal y se le fuerza el cambio', async ({ page }) => {
  await doSetup(page);

  const temp = await createCajero(page, 'Caja Uno', 'caja1@pos.com');

  await logout(page);
  await login(page, 'caja1@pos.com', temp);
  await expect(page).toHaveURL(/\/cambiar-password/);

  await page.getByLabel('Contraseña nueva', { exact: true }).fill('cajaSegura99');
  await page.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('cajaSegura99');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Hola, Caja Uno/ })).toBeVisible();
});

test('desactivar un usuario exige confirmación en diálogo; reactivar no', async ({ page }) => {
  test.setTimeout(120_000);
  await doSetup(page);

  const email = `caja-confirm-${Date.now()}@pos.com`;
  await createCajero(page, 'Caja Confirm', email);

  // Abrir la ficha del usuario recién creado.
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(email)}`);
  await page.locator('tr', { hasText: email }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios\/[^/]+$/);
  await expect(page.getByText('Activo', { exact: true }).first()).toBeVisible();

  // --- Rama CON diálogo: desactivar (Recipe C1) ---
  // El trigger `type="button"` no envía el form: abre el <dialog> nativo.
  await page.getByRole('button', { name: 'Desactivar usuario' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('¿Desactivar este usuario?');

  // Confirmar DENTRO del diálogo dispara `requestSubmit()` sobre el <form action>.
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar usuario' }).click();

  // Tras el revalidatePath la ficha refleja el estado inactivo.
  await expect(page.getByRole('button', { name: 'Reactivar usuario' })).toBeVisible();
  await expect(page.getByText('Inactivo', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // --- Rama SIN diálogo: reactivar es inmediato ---
  await page.getByRole('button', { name: 'Reactivar usuario' }).click();
  // `requestSubmit()` es asíncrono: `toHaveCount` reintenta y confirma que NO hubo diálogo.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Desactivar usuario' })).toBeVisible();
  await expect(page.getByText('Inactivo', { exact: true })).toHaveCount(0);
});

test('un cajero no puede acceder a /admin/usuarios', async ({ page }) => {
  await doSetup(page);
  const temp = await createCajero(page, 'Caja Dos', 'caja2@pos.com');

  await logout(page);
  await login(page, 'caja2@pos.com', temp);
  await expect(page).toHaveURL(/\/cambiar-password/);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('cajaSegura99');
  await page.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('cajaSegura99');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();

  await page.goto('/admin/usuarios');
  await expect(page.getByText(/no tienes permiso/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toHaveCount(0);
});
