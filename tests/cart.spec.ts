import { test, expect, type Page } from '@playwright/test';
import { addToCart, brl, login, signUp } from './helpers';

const summary = (page: Page, id: 'subtotal' | 'discount' | 'shipping' | 'total') => page.getByTestId(id);

test('adding from the catalog updates the header and the cart', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-product="p05"]').getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.locator('#cart-count')).toHaveText('1');
  await page.goto('/carrinho');
  await expect(page.locator('[data-line="p05"]')).toContainText('Teclado Mecânico Compacto');
  // Above R$ 299,00 shipping is free, so the total equals the subtotal.
  await expect(summary(page, 'subtotal')).toHaveText(brl(32900));
  await expect(summary(page, 'shipping')).toHaveText('Grátis');
  await expect(summary(page, 'total')).toHaveText(brl(32900));
});

test('changing the quantity updates the line total', async ({ page }) => {
  await addToCart(page, 'p01');
  await page.goto('/carrinho');
  await page.getByLabel('Quantidade de Cafeteira Italiana 6 xícaras').fill('2');
  await page.getByLabel('Quantidade de Cafeteira Italiana 6 xícaras').press('Enter');
  await expect(page.locator('[data-line="p01"]')).toContainText(brl(25980));
  await expect(page.locator('#cart-count')).toHaveText('2');
});

test('removing the last item shows the empty cart', async ({ page }) => {
  await addToCart(page, 'p06');
  await page.goto('/carrinho');
  await page.getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
});

test('the catalog refuses more units than the stock', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('[data-product="p08"]');
  await card.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.locator('#cart-count')).toHaveText('1');
  await card.getByRole('button').click();
  await expect(card.getByRole('alert')).toHaveText('Só temos 1 unidade(s) em estoque.');
});

test('the cart refuses a quantity above the stock @B06', async ({ page }) => {
  await addToCart(page, 'p04');
  await page.goto('/carrinho');
  const qty = page.getByLabel('Quantidade de Fone Bluetooth Ônix');
  await qty.fill('5');
  await qty.press('Enter');
  await expect(page.locator('#cart-error')).toHaveText('Só temos 3 unidade(s) em estoque.');
  const cart = await (await page.request.get('/api/cart')).json();
  expect(cart.lines[0].qty).toBe(1);
});

test('the cart total includes shipping @B07', async ({ page }) => {
  await addToCart(page, 'p06');
  await page.goto('/carrinho');
  await expect(summary(page, 'shipping')).toHaveText(brl(1990));
  await expect(summary(page, 'total')).toHaveText(brl(8990 + 1990));
});

test('a guest cart is kept after login', async ({ page }) => {
  const email = await signUp(page);
  await page.request.post('/api/logout');
  await addToCart(page, 'p03', 2);
  await login(page, email);
  await page.goto('/carrinho');
  await expect(page.locator('[data-line="p03"] input')).toHaveValue('2');
});

test('a guest cart is merged into the saved cart on login @B08', async ({ page }) => {
  const email = await signUp(page);
  await addToCart(page, 'p01');
  await page.request.post('/api/logout');
  await addToCart(page, 'p03');
  await login(page, email);
  await page.goto('/carrinho');
  await expect(page.locator('[data-line="p01"]')).toBeVisible();
  await expect(page.locator('[data-line="p03"]')).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText('2');
});
