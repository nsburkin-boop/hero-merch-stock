export const locations = { office: 'Офис', warehouse: 'Единый склад' };
export const roles = { admin: 'Администратор', editor: 'Редактор', reader: 'Читатель' };
export const actions = { create: 'Добавление', edit: 'Редактирование', adjust: 'Корректировка', transfer: 'Перемещение' };
export const initialVariant = { name: '', sku: '', color: '', size: '', photo: '', purchase: 0, retail: 0, office: 0, warehouse: 0 };
export const canEdit = role => ['admin', 'editor'].includes(role);
export const isLow = value => value < 3;
export const skuId = sku => {
  const id = sku.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(id)) throw new Error('Артикул: до 64 символов, латинские буквы, цифры, точка, дефис и подчёркивание.');
  return id;
};

export function nextVariant(action, current, fields) {
  if (action === 'create') {
    if (current) throw new Error('Этот артикул уже есть в каталоге.');
    return { ...fields, sku: skuId(fields.sku) };
  }
  if (!current) throw new Error('Артикул не найден.');
  if (action === 'edit') {
    const { name, color, size, photo, purchase, retail } = fields;
    return { ...current, name, color, size, photo, purchase, retail };
  }
  if (action === 'adjust') {
    const { location, delta } = fields;
    if (!Object.hasOwn(locations, location) || !Number.isSafeInteger(delta) || delta === 0) throw new Error('Введите целое изменение остатка.');
    const quantity = current[location] + delta;
    if (quantity < 0 || quantity > 1000000000) throw new Error('Итоговый остаток должен быть от 0 до 1 000 000 000.');
    return { ...current, [location]: quantity };
  }
  const { from, amount } = fields;
  if (action !== 'transfer' || !Object.hasOwn(locations, from) || !Number.isSafeInteger(amount) || amount < 1) throw new Error('Укажите локацию и целое положительное количество.');
  if (current[from] < amount) throw new Error('Недостаточно единиц в локации отправления.');
  const to = from === 'office' ? 'warehouse' : 'office';
  if (current[to] + amount > 1000000000) throw new Error('Превышен допустимый остаток в локации назначения.');
  return { ...current, [from]: current[from] - amount, [to]: current[to] + amount };
}

export function validPhoto(url, cloud) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.origin === 'https://res.cloudinary.com' && !!cloud && parsed.pathname.startsWith('/' + cloud + '/image/upload/');
  } catch {
    return false;
  }
}
