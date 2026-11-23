// In-memory data. Prices are integer cents.
const PRODUCTS = [
  { id: 'p01', name: 'Cafeteira Italiana 6 xícaras', category: 'Cozinha', price: 12990, stock: 8 },
  { id: 'p02', name: 'Moedor de Café Manual', category: 'Cozinha', price: 18900, stock: 5 },
  { id: 'p03', name: 'Caneca Térmica 500 ml', category: 'Cozinha', price: 7450, stock: 20 },
  { id: 'p04', name: 'Fone Bluetooth Ônix', category: 'Eletrônicos', price: 24990, stock: 3 },
  { id: 'p05', name: 'Teclado Mecânico Compacto', category: 'Eletrônicos', price: 32900, stock: 4 },
  { id: 'p06', name: 'Mouse Sem Fio', category: 'Eletrônicos', price: 8990, stock: 12 },
  { id: 'p07', name: 'Livro: Testes de Software na Prática', category: 'Livros', price: 6990, stock: 10 },
  { id: 'p08', name: 'Livro: Café, uma História', category: 'Livros', price: 5490, stock: 1 },
  { id: 'p09', name: 'Luminária de Mesa LED', category: 'Casa', price: 15900, stock: 6 },
  { id: 'p10', name: 'Planta Artificial Média', category: 'Casa', price: 4990, stock: 0 },
];

const COUPONS = {
  DESCONTO10: { type: 'percent', value: 10 },
  VIP20: { type: 'percent', value: 20, min: 20000 },
  FRETEGRATIS: { type: 'shipping' },
  NATAL2025: { type: 'percent', value: 15, expired: true },
};

const SHIPPING = 1990;
const FREE_SHIPPING_FROM = 29900;

function createStore() {
  return {
    products: PRODUCTS.map((p) => ({ ...p })),
    users: new Map(), // email -> user
    sessions: new Map(), // sid -> { userId|null }
    carts: new Map(), // cartKey -> { items: { productId: qty }, coupon }
    orders: [],
    nextUserId: 1,
    nextOrderId: 1001,
  };
}

module.exports = { createStore, COUPONS, SHIPPING, FREE_SHIPPING_FROM };
