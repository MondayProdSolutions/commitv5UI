import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@pos.com';
export const ADMIN_PASS = 'caballoAzul42';

/**
 * Ensures the bootstrap administrator exists and the page ends up authenticated
 * on the dashboard.
 *
 * The E2E specs share one server + one ephemeral DB (workers: 1) and run in a
 * fresh browser context each. Bootstrap is global one-time state: the first spec
 * that calls this fills the `/setup` form; every later call finds `/setup` gone
 * (404) and just logs the same admin in.
 */
export async function doSetup(
  page: Page,
  email: string = ADMIN_EMAIL,
  pass: string = ADMIN_PASS,
): Promise<void> {
  const resp = await page.goto('/setup');
  const gone = resp?.status() === 404 || (await page.getByLabel('Nombre').count()) === 0;

  if (!gone) {
    await page.getByLabel('Nombre').fill('Admin');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(pass);
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill(pass);
    await page.getByRole('button', { name: 'Crear administrador' }).click();
  } else {
    await login(page, email, pass);
  }
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Submits the login form. Does not assert the outcome (may be a failure case). */
export async function login(page: Page, email: string, pass: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Opens the user menu in the Topbar and clicks "Cerrar sesión". */
export async function logout(page: Page): Promise<void> {
  await page.locator('header details > summary').click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Abre la caja con el fondo indicado desde `/caja`. Si ya hay una sesión
 * abierta (panel visible en vez del formulario), no hace nada — es idempotente.
 */
export async function abrirCaja(page: Page, fondo: number): Promise<void> {
  await page.goto('/caja');
  const fondoInput = page.getByLabel('Fondo de apertura');
  if (await fondoInput.count()) {
    await fondoInput.fill(String(fondo));
    await page.getByRole('button', { name: 'Abrir caja' }).click();
  }
  await expect(page.getByRole('link', { name: 'Cerrar caja (arqueo)' })).toBeVisible();
}
