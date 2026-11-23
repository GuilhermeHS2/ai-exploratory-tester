import { test, expect } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './helpers';

async function fillRegister(page: import('@playwright/test').Page, password = PASSWORD, confirm = password, email = uniqueEmail()) {
  await page.goto('/cadastro');
  const form = page.locator('#register');
  await form.locator('[name=name]').fill('Ana Teste');
  await form.locator('[name=email]').fill(email);
  await form.locator('[name=password]').fill(password);
  await form.locator('[name=confirm]').fill(confirm);
  await form.getByRole('button', { name: 'Criar conta' }).click();
  return form;
}

test('creates an account and lands logged in', async ({ page }) => {
  await fillRegister(page);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Olá, Ana' })).toBeVisible();
});

test('rejects a confirmation that does not match', async ({ page }) => {
  const form = await fillRegister(page, PASSWORD, 'outra-senha-1');
  await expect(form.getByRole('alert')).toHaveText('As senhas não conferem.');
});

test('rejects an e-mail that already has an account', async ({ page }) => {
  const email = uniqueEmail();
  await page.request.post('/api/register', { data: { name: 'Ana', email, password: PASSWORD, confirm: PASSWORD } });
  const form = await fillRegister(page, PASSWORD, PASSWORD, email);
  await expect(form.getByRole('alert')).toHaveText('Já existe uma conta com este e-mail.');
});

test('rejects a 7-character password @B01', async ({ page }) => {
  const form = await fillRegister(page, 'abc1234');
  await expect(form.getByRole('alert')).toHaveText('A senha precisa ter pelo menos 8 caracteres.');
  await expect(page).toHaveURL('/cadastro');
});

test('every register field has an accessible label @B03', async ({ page }) => {
  await page.goto('/cadastro');
  for (const name of ['Nome completo', 'E-mail', 'Senha', 'Confirmar senha']) {
    await expect(page.getByLabel(name, { exact: true }), name).toBeVisible();
  }
});
