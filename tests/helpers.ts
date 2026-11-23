import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'senha-segura-1';
export const uniqueEmail = () => `qa-${randomUUID()}@exemplo.com`;
// pt-BR currency text as the app renders it (non-breaking space after R$).
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Registers and logs in through the API; the page shares the session cookie. */
export async function signUp(page: Page, name = 'Ana Teste') {
  const email = uniqueEmail();
  const reg = await page.request.post('/api/register', { data: { name, email, password: PASSWORD, confirm: PASSWORD } });
  expect(reg.status()).toBe(201);
  await login(page, email);
  return email;
}

export async function login(page: Page, email: string) {
  expect((await page.request.post('/api/login', { data: { email, password: PASSWORD } })).ok()).toBe(true);
}

export async function addToCart(page: Page, productId: string, qty = 1) {
  const res = await page.request.post('/api/cart', { data: { productId, qty } });
  expect(res.ok(), await res.text()).toBe(true);
}

export const ADDRESS = { cep: '86010-000', street: 'Rua Sergipe', number: '100', city: 'Londrina' };

/** Places an order through the API and returns its id. */
export async function buy(page: Page, method: 'pix' | 'cartao' = 'pix') {
  const payment = method === 'pix' ? { method } : { method, card: '4111111111111111', expiry: '12/39', cvv: '123' };
  const res = await page.request.post('/api/checkout', { data: { address: ADDRESS, payment } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id as number;
}

/** Stock shown on the catalog card of a product. */
export async function catalogStock(page: Page, productId: string) {
  await page.goto('/');
  const text = await page.locator(`[data-product="${productId}"] .muted`).innerText();
  return text === 'Esgotado' ? 0 : Number.parseInt(text, 10);
}
