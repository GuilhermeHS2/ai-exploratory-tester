import { test, expect } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './helpers';

async function registered(page: import('@playwright/test').Page) {
  const email = uniqueEmail();
  await page.request.post('/api/register', { data: { name: 'Bruno Teste', email, password: PASSWORD, confirm: PASSWORD } });
  return email;
}

test('logs in and out', async ({ page }) => {
  const email = await registered(page);
  await page.goto('/entrar');
  const form = page.locator('#login');
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=password]').fill(PASSWORD);
  await form.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Olá, Bruno' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Criar conta' })).toBeVisible();
});

test('returns to the page that asked for login', async ({ page }) => {
  const email = await registered(page);
  await page.goto('/perfil');
  await expect(page).toHaveURL('/entrar?next=/perfil');
  await page.locator('#login [name=email]').fill(email);
  await page.locator('#login [name=password]').fill(PASSWORD);
  await page.locator('#login').getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/perfil');
});

test('wrong password shows a Portuguese error', async ({ page }) => {
  const email = await registered(page);
  await page.goto('/entrar');
  const form = page.locator('#login');
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=password]').fill('senha-errada');
  await form.getByRole('button', { name: 'Entrar' }).click();
  await expect(form.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});
