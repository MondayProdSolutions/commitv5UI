import { test, expect } from '@playwright/test';
import { doSetup, login, logout, ADMIN_EMAIL, ADMIN_PASS } from './helpers';

test('el bootstrap crea el administrador y entra sin cambio forzado de contraseña', async ({
  page,
}) => {
  await doSetup(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).not.toHaveURL(/\/cambiar-password/);
  await expect(page.getByRole('heading', { name: /Hola, Admin/ })).toBeVisible();
});

test('la ruta /setup deja de existir tras el bootstrap', async ({ page }) => {
  await doSetup(page);
  // Con sesión activa, /setup (ruta pública) redirige a /dashboard; cerramos
  // sesión para poder comprobar que la ruta ya no existe (404) tras el bootstrap.
  await logout(page);
  const resp = await page.goto('/setup');
  expect(resp?.status()).toBe(404);
  await expect(
    page.getByText(/no encontrada|no se encontr|could not be found|404/i).first(),
  ).toBeVisible();
});

test('un login fallido muestra el mensaje genérico "Credenciales inválidas"', async ({ page }) => {
  await doSetup(page);
  await logout(page);
  await login(page, ADMIN_EMAIL, 'contraseñaIncorrecta');
  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // y con las credenciales correctas sí entra
  await login(page, ADMIN_EMAIL, ADMIN_PASS);
  await expect(page).toHaveURL(/\/dashboard/);
});
