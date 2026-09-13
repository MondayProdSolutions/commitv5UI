import { test, expect } from '@playwright/test';
import { doSetup } from './helpers';

/**
 * El `InactivityWatcher` fija `totalSeconds = max(minutos*60, 120)` y avisa a los
 * `max(totalSeconds - 60, 30)` segundos de inactividad. El aviso más temprano
 * posible son 60 s (con 1 o 2 minutos configurados). Se usa 2 minutos para que,
 * cuando aparezca el modal, la sesión del servidor (timeout = 2 min) siga viva y
 * "Seguir conectado" pueda renovarla de verdad.
 */
test('el aviso de inactividad aparece y "Seguir conectado" renueva la sesión', async ({ page }) => {
  test.setTimeout(230_000);

  await doSetup(page);

  await page.goto('/admin/configuracion');
  await page.getByLabel('Minutos sin actividad').fill('2');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Configuración actualizada')).toBeVisible();

  // A partir de aquí no hay más actividad: el último latido al servidor fue el de
  // guardar la configuración, así que la sesión caduca ~120 s después de este punto.
  await page.goto('/dashboard');

  const dialog = page.getByRole('dialog', { name: /inactividad/i });
  await expect(dialog).toBeVisible({ timeout: 90_000 });

  // Pequeño margen para superar de sobra el throttle de `touchSession` (60 s) en
  // el servidor, de modo que el latido de "Seguir conectado" sí deslice
  // `lastActivityAt`/`expiresAt` hacia adelante.
  await page.waitForTimeout(4_000);

  // (1) "Seguir conectado" dispara POST /api/session/heartbeat y debe responder 200.
  const heartbeat = page.waitForResponse(
    (r) => r.url().includes('/api/session/heartbeat') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Seguir conectado' }).click();
  const hbResp = await heartbeat;
  expect(hbResp.status()).toBe(200);

  await expect(page.getByRole('dialog')).toBeHidden();

  // (2) Prueba fuerte: esperamos MÁS ALLÁ de la expiración original (~120 s desde
  // el latido previo a llegar al dashboard). Si el heartbeat no hubiera renovado
  // la sesión, el proxy nos mandaría a /login; como sí la renovó, sigue viva.
  await page.waitForTimeout(70_000);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Hola, Admin/ })).toBeVisible();
});
