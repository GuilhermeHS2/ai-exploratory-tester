import { test, expect } from '@playwright/test';

test('lists every product', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#results-count')).toHaveText('10 produto(s)');
  await expect(page.locator('[data-product="p10"] button')).toBeDisabled();
});

test('search ignores accents and case', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar produtos' }).fill('CAFE');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#results-count')).toHaveText('3 produto(s)');
  await expect(page.getByRole('heading', { name: 'Livro: Café, uma História' })).toBeVisible();
});

test('filters by category and shows an empty state', async ({ page }) => {
  await page.goto('/?categoria=Livros');
  await expect(page.locator('#results-count')).toHaveText('2 produto(s)');
  await page.goto('/?q=geladeira');
  await expect(page.getByText('Nenhum produto encontrado.')).toBeVisible();
});
