import { test, expect } from '@playwright/test';
import { addToCart, brl, buy, signUp } from './helpers';

test('updates name and phone in the profile', async ({ page }) => {
  await signUp(page);
  await page.goto('/perfil');
  const form = page.locator('#profile');
  await form.getByLabel('Nome').fill('Carla Souza');
  await form.getByLabel('Telefone').fill('(43) 99999-0000');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados salvos.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Olá, Carla' })).toBeVisible();
  await page.reload();
  await expect(form.getByLabel('Telefone')).toHaveValue('43999990000');
});

test('rejects an invalid phone', async ({ page }) => {
  await signUp(page);
  await page.goto('/perfil');
  const form = page.locator('#profile');
  await form.getByLabel('Telefone').fill('123');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form.getByRole('alert')).toHaveText('Telefone inválido.');
});

test('lists my orders and opens one', async ({ page }) => {
  await signUp(page);
  await page.goto('/perfil');
  await expect(page.getByText('Você ainda não fez pedidos.')).toBeVisible();
  await addToCart(page, 'p09');
  const id = await buy(page);
  await page.reload();
  await page.getByRole('link', { name: `Pedido #${id}` }).click();
  await expect(page.locator('#order')).toContainText(`1 × Luminária de Mesa LED (${brl(15900)})`);
});

test('another customer cannot open my order @B10', async ({ page, browser }) => {
  await signUp(page);
  await addToCart(page, 'p06');
  const id = await buy(page);
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const otherPage = await other.newPage();
  await signUp(otherPage, 'Davi Outro');
  await otherPage.goto(`/pedido?id=${id}`);
  await expect(otherPage.locator('#order')).toHaveText('Pedido não encontrado.');
  await other.close();
});
