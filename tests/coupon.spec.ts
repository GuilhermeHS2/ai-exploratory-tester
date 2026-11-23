import { test, expect, type Page } from '@playwright/test';
import { addToCart, brl } from './helpers';

async function applyCoupon(page: Page, code: string) {
  const form = page.locator('#coupon');
  await form.getByLabel('Cupom de desconto').fill(code);
  await form.getByRole('button', { name: 'Aplicar' }).click();
  return form;
}

test('DESCONTO10 takes 10% off the products', async ({ page }) => {
  await addToCart(page, 'p05');
  await page.goto('/carrinho');
  await applyCoupon(page, 'desconto10');
  await expect(page.getByText('Cupom DESCONTO10 aplicado')).toBeVisible();
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(3290)}`);
  await expect(page.getByTestId('total')).toHaveText(brl(29610));
});

test('the discount is not applied to shipping @B04', async ({ page }) => {
  await addToCart(page, 'p01');
  await page.goto('/carrinho');
  await applyCoupon(page, 'DESCONTO10');
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(1299)}`);
  const cart = await (await page.request.get('/api/cart')).json();
  expect(cart.total).toBe(12990 - 1299 + 1990);
});

test('VIP20 works above the minimum order', async ({ page }) => {
  await addToCart(page, 'p05');
  await page.goto('/carrinho');
  await applyCoupon(page, 'VIP20');
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(6580)}`);
  await expect(page.getByTestId('total')).toHaveText(brl(26320));
});

test('VIP20 is refused below R$ 200 in products @B05', async ({ page }) => {
  await addToCart(page, 'p02');
  await page.goto('/carrinho');
  const form = await applyCoupon(page, 'VIP20');
  await expect(form.getByRole('alert')).toHaveText('Pedido mínimo de R$ 200,00 para este cupom.');
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(0)}`);
});

test('VIP20 is removed when the cart drops below the minimum', async ({ page }) => {
  await addToCart(page, 'p05');
  await addToCart(page, 'p06');
  await page.goto('/carrinho');
  await applyCoupon(page, 'VIP20');
  await expect(page.getByText('Cupom VIP20 aplicado')).toBeVisible();
  await page.locator('[data-line="p05"]').getByRole('button', { name: 'Remover' }).click();
  await expect(page.locator('#note')).toHaveText('Cupom VIP20 removido: pedido abaixo do mínimo.');
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(0)}`);
});

test('FRETEGRATIS removes shipping', async ({ page }) => {
  await addToCart(page, 'p06');
  await page.goto('/carrinho');
  await applyCoupon(page, 'FRETEGRATIS');
  await expect(page.getByTestId('shipping')).toHaveText('Grátis');
  await expect(page.getByTestId('total')).toHaveText(brl(8990));
});

test('expired and unknown coupons are refused', async ({ page }) => {
  await addToCart(page, 'p06');
  await page.goto('/carrinho');
  let form = await applyCoupon(page, 'NATAL2025');
  await expect(form.getByRole('alert')).toHaveText('Este cupom expirou.');
  form = await applyCoupon(page, 'XPTO');
  await expect(form.getByRole('alert')).toHaveText('Cupom inválido.');
});

test('a coupon can be removed', async ({ page }) => {
  await addToCart(page, 'p05');
  await page.goto('/carrinho');
  await applyCoupon(page, 'DESCONTO10');
  await page.getByRole('button', { name: 'Remover cupom' }).click();
  await expect(page.getByTestId('discount')).toHaveText(`- ${brl(0)}`);
});
