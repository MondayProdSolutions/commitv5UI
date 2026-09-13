import { test, expect } from '@playwright/test';
import { doSetup, login, ADMIN_EMAIL, ADMIN_PASS } from './helpers';

test('"Cerrar todas las demás" invalida las otras sesiones del mismo usuario', async ({
  browser,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  try {
    const pageA = await ctxA.newPage();
    await doSetup(pageA);

    const pageB = await ctxB.newPage();
    await login(pageB, ADMIN_EMAIL, ADMIN_PASS);
    await expect(pageB).toHaveURL(/\/dashboard/);

    await pageA.goto('/perfil');
    const btn = pageA.getByRole('button', { name: 'Cerrar todas las demás' });
    await expect(btn).toBeVisible();
    await Promise.all([
      pageA.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/perfil'),
      ),
      btn.click(),
    ]);

    // La sesión de A sigue viva.
    await pageA.goto('/dashboard');
    await expect(pageA).toHaveURL(/\/dashboard/);

    // La de B queda revocada: su siguiente navegación cae en /login.
    await pageB.goto('/dashboard');
    await expect(pageB).toHaveURL(/\/login/);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
