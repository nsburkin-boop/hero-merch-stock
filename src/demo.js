import { nextVariant, skuId } from './inventory.js';

const samples = [
  ['Футболка тренировочная', 'HL-TS-BLK-M', 'Чёрный', 'M', 4, 37, 850, 2490],
  ['Футболка тренировочная', 'HL-TS-BLK-L', 'Чёрный', 'L', 2, 24, 850, 2490],
  ['Бейсболка базовая', 'HL-CAP-BLK', 'Чёрный', 'ONE SIZE', 12, 46, 510, 1690],
  ['Спортивная бутылка 750 мл', 'HL-BTL-750', 'Красный', '750 мл', 7, 1, 320, 1190],
  ['Худи «Лига Героев»', 'HL-HD-GRY-XL', 'Серый', 'XL', 0, 15, 1730, 4990],
  ['Сумка поясная', 'HL-BAG-BLK', 'Чёрный', 'ONE SIZE', 5, 19, 670, 2290],
  ['Носки беговые', 'HL-SOCK-WHT-42', 'Белый', '42–45', 11, 54, 210, 790],
  ['Полотенце из микрофибры', 'HL-TWL-BLK', 'Чёрный', '40 × 80 см', 9, 31, 410, 1390]
];

const key = 'hero-merch-stock-demo-v1';
export function readDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.variants && saved?.history) return saved;
  } catch { /* Use initial demo rows if local storage is unavailable or invalid. */ }
  return {
    variants: samples.map(([name, sku, color, size, office, warehouse, purchase, retail]) =>
      ({ name, sku, id: sku, color, size, office, warehouse, purchase: purchase * 100, retail: retail * 100, photo: '' })),
    history: []
  };
}

export function writeDemo(action, sku, fields, note) {
  const state = readDemo();
  const id = skuId(sku);
  const before = state.variants.find(row => row.id === id) || null;
  const after = { ...nextVariant(action, before, fields), id };
  const history = [{ id: crypto.randomUUID(), action, sku: id, before, after, note, at: Date.now(), actor: 'Демо' }, ...state.history];
  const variants = before ? state.variants.map(row => row.id === id ? after : row) : [...state.variants, after];
  const result = { variants, history };
  localStorage.setItem(key, JSON.stringify(result));
  return result;
}
