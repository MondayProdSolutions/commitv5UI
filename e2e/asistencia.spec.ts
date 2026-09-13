import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * E2E del Bloque 7 (Asistencia) — spec §10.
 *
 * `test.use` a nivel de archivo activa el permiso de cámara y fuerza a
 * Chromium a exponer un dispositivo de video sintético (sin hardware real),
 * para el escenario "con cámara". El escenario "sin cámara" sobreescribe
 * `navigator.mediaDevices.getUserMedia` vía `addInitScript` para simular el
 * fallo, independientemente del flag de Chromium.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

async function crearEmpleado(page: Page, email: string): Promise<string> {
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill('Empleado Asistencia');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Empleado' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  await page.getByRole('button', { name: 'Entendido' }).click();
  return temp;
}

async function cambiarPassword(page: Page, email: string, temp: string, nueva: string): Promise<void> {
  await login(page, email, temp);
  await expect(page).toHaveURL(/\/cambiar-password/);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
  await page.getByLabel('Confirmar contraseña nueva', { exact: true }).fill(nueva);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
}

test('Marcar entrada y salida con cámara simulada guarda fotos y calcula horas', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `emp-asistencia-${Date.now()}@pos.com`;
  const temp = await crearEmpleado(page, email);

  const ctx = await browser.newContext({ permissions: ['camera'] });
  const emp = await ctx.newPage();
  try {
    await cambiarPassword(emp, email, temp, 'empleadoSegura99');

    await emp.goto('/asistencia/registrar');
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await emp.getByRole('button', { name: 'Capturar foto' }).click();
    await emp.getByRole('button', { name: 'Marcar entrada' }).click();
    await expect(emp.getByText('Entrada registrada.')).toBeVisible();

    await emp.reload();
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await emp.getByRole('button', { name: 'Capturar foto' }).click();
    await emp.getByRole('button', { name: 'Marcar salida' }).click();
    await expect(emp.getByText('Salida registrada.')).toBeVisible();
  } finally {
    await ctx.close();
  }

  await page.goto('/asistencia?atajo=hoy');
  await expect(page.getByText('Empleado Asistencia')).toBeVisible();
  const tarjeta = page
    .locator('div.rounded-control')
    .filter({ has: page.getByText('Empleado Asistencia') });
  await expect(tarjeta.locator('img')).toHaveCount(2);
});

test('Marcar entrada sin cámara disponible igual registra la asistencia', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `emp-sincamara-${Date.now()}@pos.com`;
  const temp = await crearEmpleado(page, email);

  const ctx = await browser.newContext();
  const emp = await ctx.newPage();
  try {
    await emp.addInitScript(() => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.reject(new DOMException('Denegado', 'NotAllowedError')) },
        configurable: true,
      });
    });

    await cambiarPassword(emp, email, temp, 'empleadoSegura99');

    await emp.goto('/asistencia/registrar');
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await expect(emp.getByText('No se pudo acceder a la cámara — se registrará sin foto.')).toBeVisible();
    await emp.getByRole('button', { name: 'Marcar entrada' }).click();
    await expect(emp.getByText('Entrada registrada.')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
