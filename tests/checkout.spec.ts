import { test, expect, type Page } from '@playwright/test';
import { ADDRESS, addToCart, brl, buy, catalogStock, signUp } from './helpers';

async function fillAddress(page: Page, cep = ADDRESS.cep) {
  const form = page.locator('#checkout');
  await form.getByLabel('CEP').fill(cep);
  await form.getByLabel('Rua').fill(ADDRESS.street);
  await form.getByLabel('Número', { exact: true }).fill(ADDRESS.number);
  await form.getByLabel('Cidade').fill(ADDRESS.city);
  return form;
}

test('a guest is sent to login before checkout', async ({ page }) => {
  await addToCart(page, 'p06');
  await page.goto('/checkout');
  await expect(page).toHaveURL('/entrar?next=/checkout');
});

test('buys with a credit card', async ({ page }) => {
  await signUp(page);
  await addToCart(page, 'p07');
  await page.goto('/checkout');
  await expect(page.locator('#order-total')).toHaveText(brl(6990 + 1990));
  const form = await fillAddress(page);
  await form.getByLabel('Número do cartão').fill('4111 1111 1111 1111');
  await form.getByLabel('Validade (MM/AA)').fill('12/39');
  await form.getByLabel('CVV').fill('123');
  await form.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page.getByText(/Pedido #\d+ confirmado\./)).toBeVisible();
  await expect(page.locator('#order')).toContainText(`Pagamento: Cartão de crédito · Total: ${brl(8980)}`);
  await expect(page.locator('#cart-count')).toHaveText('0');
});

test('buys with Pix', async ({ page }) => {
  await signUp(page);
  await addToCart(page, 'p05');
  await page.goto('/checkout');
  const form = await fillAddress(page);
  await form.getByLabel('Pix').check();
  await expect(form.getByLabel('Número do cartão')).toBeHidden();
  await form.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page.locator('#order')).toContainText(`Pagamento: Pix · Total: ${brl(32900)}`);
});

test('an expired card is refused', async ({ page }) => {
  await signUp(page);
  await addToCart(page, 'p06');
  await page.goto('/checkout');
  const form = await fillAddress(page);
  await form.getByLabel('Número do cartão').fill('4111111111111111');
  await form.getByLabel('Validade (MM/AA)').fill('01/20');
  await form.getByLabel('CVV').fill('123');
  await form.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(form.getByRole('alert')).toHaveText('Validade inválida.');
});

test('an invalid CEP shows a Portuguese error @B02', async ({ page }) => {
  await signUp(page);
  await addToCart(page, 'p06');
  await page.goto('/checkout');
  const form = await fillAddress(page, '123');
  await form.getByLabel('Pix').check();
  await form.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(form.getByRole('alert')).toHaveText('CEP inválido.');
  await expect(form.getByLabel('CEP')).toHaveAttribute('aria-invalid', 'true');
});

// Only this test buys p03, so the stock check is safe in parallel.
test('a Pix purchase lowers the stock @B09', async ({ page }) => {
  const before = await catalogStock(page, 'p03');
  await signUp(page);
  await addToCart(page, 'p03', 2);
  await buy(page, 'pix');
  expect(await catalogStock(page, 'p03')).toBe(before - 2);
});
