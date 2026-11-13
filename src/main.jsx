import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as backend from './firebase.js';
import { actions, canEdit, initialVariant, isLow, locations, roles, validPhoto } from './inventory.js';
import { readDemo, writeDemo } from './demo.js';
import './style.css';

const labels = { catalog: 'Каталог', history: 'История', access: 'Доступы' };
const money = cents => (cents / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
const formatCount = value => value.toLocaleString('ru-RU');
const fmtDate = value => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(value.toDate?.() ?? value) : 'Сохраняется';
const errors = {
  'permission-denied': 'Доступ к операции закрыт.',
  'auth/invalid-credential': 'Проверьте почту и пароль.',
  'auth/network-request-failed': 'Не удалось подключиться. Проверьте интернет.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
  unavailable: 'Сервис временно недоступен. Попробуйте позже.'
};
const message = error => errors[error.code] || (error.code ? 'Не удалось выполнить операцию.' : error.message);

function Icon({ name, size = 20 }) {
  const paths = {
    catalog: 'M3 7l9-4 9 4v10l-9 4-9-4V7zm0 0l9 4 9-4m-9 4v10M7.5 5l9 4',
    history: 'M4 11a8 8 0 1 1 2 6m-2-6V5m0 6h6m2-4v5l3 2',
    access: 'M12 22s7-4 7-10V5l-7-3-7 3v7c0 6 7 10 7 10zm-3-10 2 2 4-4',
    search: 'M16 16l4 4M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
    plus: 'M12 5v14M5 12h14',
    transfer: 'M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4',
    edit: 'M4 20l5-1L20 8l-4-4L5 15l-1 5zm10-14 4 4',
    close: 'M6 6l12 12M18 6 6 18',
    logout: 'M10 4H5v16h5m4-4 4-4-4-4m4 4H9',
    image: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M16 8h.01',
    office: 'M4 21V7h16v14M8 7V3h8v4M9 21v-5h6v5M8 11h2m4 0h2M2 21h20',
    warehouse: 'M3 21V8l9-5 9 5v13M7 21V11h10v10M7 15h10m-10 3h10M2 21h20'
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}

function Brand() {
  return <div className="brand"><img src="/hero-league.png" alt="Логотип Hero League"/><div><strong>ЛИГА ГЕРОЕВ</strong><span>Склад мерча</span></div></div>;
}

function Login({ user, role, failure }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try { await backend.login(data.get('email').trim(), data.get('password')); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <main className="login"><section><Brand/><h1>{user ? 'Доступ к складу' : 'Вход в склад'}</h1>
    {user ? <><p>{failure || (role === null ? 'Проверяем права доступа…' : 'Попросите администратора назначить роль вашей учётной записи.')}</p><button className="button secondary" onClick={backend.logout}>Выйти</button></>
      : <form onSubmit={submit}><Field name="email" label="Электронная почта" type="email" autoComplete="username"/><Field name="password" label="Пароль" type="password" autoComplete="current-password"/>{error && <p role="alert" className="error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button></form>}
  </section></main>;
}

function App() {
  const demo = !backend.configured && import.meta.env.VITE_DEMO === 'true';
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState(null);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    if (!backend.configured) return;
    return backend.observeUser(next => { setRole(null); setFailure(''); setUser(next); });
  }, []);
  useEffect(() => {
    if (!user) return;
    return backend.observeRole(user.uid, setRole, error => setFailure(message(error)));
  }, [user]);
  if (demo) return <Workspace demo role="admin"/>;
  if (!backend.configured) return <main className="login"><section><Brand/><h1>Ожидает настройки</h1><p>Для входа подключите проект Firebase.</p></section></main>;
  if (user === undefined) return <main className="login"><section><Brand/><p>Загрузка…</p></section></main>;
  if (!user || !Object.hasOwn(roles, role)) return <Login user={user} role={role} failure={failure}/>;
  return <Workspace key={user.uid} user={user} role={role}/>;
}

function Workspace({ demo, role, user }) {
  const [page, setPage] = useState('catalog');
  const [historyLimit, setHistoryLimit] = useState(200);
  const [data, setData] = useState(() => demo ? readDemo() : { variants: null, history: null });
  const [failure, setFailure] = useState({});
  const [dialog, setDialog] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const selectedProduct = data.variants?.find(row => row.id === selectedId);
  const [notice, setNotice] = useState('');
  const active = page === 'access' && (role !== 'admin' || demo) ? 'catalog' : page;
  useEffect(() => {
    if (demo) return;
    const name = active === 'history' ? 'history' : 'variants';
    setFailure(previous => ({ ...previous, [name]: '' }));
    return backend.observeRows(name, rows => setData(previous => ({ ...previous, [name]: rows })), error => setFailure(previous => ({ ...previous, [name]: message(error) })), historyLimit);
  }, [active, demo, historyLimit]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function save(action, sku, fields, note) {
    if (demo) setData(writeDemo(action, sku, fields, note));
    else await backend.writeVariant(action, sku, fields, note);
    setDialog(null);
    setNotice(action === 'transfer' ? 'Перемещение проведено' : 'Изменения сохранены');
  }
  function switchPage(next) {
    setDialog(null);
    setSelectedId(null);
    setPage(next);
  }
  return <div className="app">
    <aside className="sidebar">
      <Brand/>
      <nav aria-label="Разделы склада">
        {Object.entries(labels).filter(([key]) => key !== 'access' || (role === 'admin' && !demo)).map(([key, label]) =>
          <button key={key} className={active === key ? 'nav active' : 'nav'} aria-current={active === key ? 'page' : undefined} onClick={() => switchPage(key)}><Icon name={key}/>{label}</button>)}
      </nav>
      <div className="account"><span className="avatar">{demo ? 'Д' : user.email?.[0]?.toUpperCase()}</span><div><strong>{demo ? 'Демо-режим' : user.email}</strong><span>{roles[role]}</span></div>{!demo && <button className="icon" title="Выйти" aria-label="Выйти" onClick={backend.logout}><Icon name="logout"/></button>}</div>
    </aside>
    <main className="content">
      <header className="top"><span>Склад мерча</span><span className="top-divider">/</span><strong>{labels[active]}</strong>{demo && <span className="demo">Демо · данные в этом браузере</span>}</header>
      <div className="body">
        {active === 'catalog' && <Catalog rows={data.variants} error={failure.variants} editable={canEdit(role)} view={setSelectedId} open={(action, row) => setDialog({ action, row })}/>}
        {active === 'history' && <History rows={data.history} error={failure.history} more={!demo && data.history?.length === historyLimit ? () => setHistoryLimit(limit => limit + 200) : null}/>}
        {active === 'access' && <Access user={user}/>}
      </div>
    </main>
    {selectedProduct && <ProductDetails row={selectedProduct} close={() => setSelectedId(null)}/>}
    {dialog && canEdit(role) && <Operation {...dialog} rows={data.variants || []} close={() => setDialog(null)} save={save}/>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>;
}

function Catalog({ rows, error, editable, view, open }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const needle = search.trim().toLocaleLowerCase('ru');
  const variants = rows ?? [];
  const filtered = variants.filter(row =>
    [row.name, row.sku, row.color, row.size].some(value => value.toLocaleLowerCase('ru').includes(needle)) &&
    (filter === 'all' || (filter === 'low' ? isLow(row.office) || isLow(row.warehouse) : isLow(row[filter])))
  ).sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.sku.localeCompare(b.sku));
  const total = key => rows ? formatCount(variants.reduce((sum, row) => sum + row[key], 0)) : '…';
  return <>
    <div className="page-head"><div><h1>Каталог товаров</h1><p>Артикулы, цены и остатки по локациям</p></div>
      {editable && <div className="buttons"><button className="button secondary" disabled={!variants.length} onClick={() => open('transfer')}><Icon name="transfer"/>Перемещение</button><button className="button primary" onClick={() => open('create')}><Icon name="plus"/>Добавить товар</button></div>}
    </div>
    <div className="stats">
      <Stat icon="catalog" label="Артикулов" value={rows ? formatCount(rows.length) : '…'}/>
      <Stat icon="office" label="Офис" value={total('office')} unit="шт."/>
      <Stat icon="warehouse" label="Единый склад" value={total('warehouse')} unit="шт."/>
    </div>
    <section className="panel" aria-label="Таблица товаров">
      <div className="toolbar"><label className="search"><Icon name="search"/><input aria-label="Поиск по каталогу" placeholder="Название, артикул, цвет или размер" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <select aria-label="Фильтр остатков" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">Все остатки</option><option value="low">Менее 3 · любая локация</option><option value="office">Менее 3 · офис</option><option value="warehouse">Менее 3 · единый склад</option>
        </select>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Товар / артикул</th><th>Размер</th><th>Цвет</th><th>Закупка</th><th>Розница</th><th>Офис</th><th>Единый склад</th>{editable && <th aria-label="Действия"/>}</tr></thead>
        <tbody>{filtered.map(row => <tr key={row.id}>
          <td><button type="button" className="product product-link" onClick={() => view(row.id)} aria-label={'Открыть карточку ' + row.name + ', ' + row.sku}>
            <span className="thumb">{row.photo ? <img src={row.photo} alt="" loading="lazy"/> : <Icon name="image" size={19}/>}</span><span><strong>{row.name}</strong><code>{row.sku}</code></span>
          </button></td>
          <td><span className="size">{row.size}</span></td><td>{row.color}</td><td className="number muted">{money(row.purchase)}</td><td className="number">{money(row.retail)}</td>
          {Object.keys(locations).map(key => <td key={key} className={isLow(row[key]) ? 'number stock low' : 'number stock'}><span>{formatCount(row[key])}</span></td>)}
          {editable && <td><div className="row-actions">{[['edit','edit','Редактировать'],['adjust','plus','Скорректировать остаток'],['transfer','transfer','Переместить']].map(([action, icon, label]) => <button className="icon" key={action} title={label} aria-label={label + ' ' + row.sku} onClick={() => open(action, row)}><Icon name={icon} size={17}/></button>)}</div></td>}
        </tr>)}</tbody></table></div>
      {!filtered.length && <p className="empty" role={error ? 'alert' : 'status'}>{error || (!rows ? 'Загружаем каталог…' : rows.length ? 'По этим условиям товары не найдены.' : 'Каталог пока пуст.')}</p>}
      <div className="table-foot"><span>{formatCount(filtered.length)} из {formatCount(variants.length)} артикулов</span><span>Красным выделен остаток менее 3 шт.</span></div>
    </section>
  </>;
}

function ProductDetails({ row, close }) {
  const modal = useRef(null);
  const [failedPhoto, setFailedPhoto] = useState(null);
  const showPhoto = row.photo && row.photo !== failedPhoto;
  useEffect(() => { modal.current.showModal(); }, []);

  return <dialog className="product-dialog" ref={modal} onClose={close} aria-labelledby="product-title">
    <div className="product-details">
      <div className="modal-head"><div><h2 id="product-title">{row.name}</h2><p>Артикул {row.sku}</p></div>
        <button type="button" className="icon" aria-label="Закрыть карточку" onClick={close}><Icon name="close"/></button>
      </div>
      <div className="product-photo">
        {showPhoto ? <img src={row.photo} alt={row.name} onError={() => setFailedPhoto(row.photo)}/>
          : <div><Icon name="image" size={28}/><p>{row.photo ? 'Фото не загрузилось' : 'Фото пока нет'}</p></div>}
      </div>
      <dl className="product-facts">
        <div><dt>Размер</dt><dd>{row.size}</dd></div>
        <div><dt>Цвет</dt><dd>{row.color}</dd></div>
        <div><dt>Закупочная цена</dt><dd>{money(row.purchase)}</dd></div>
        <div><dt>Розничная цена</dt><dd>{money(row.retail)}</dd></div>
        {Object.entries(locations).map(([key, label]) =>
          <div key={key}><dt>{label}</dt><dd className={isLow(row[key]) ? 'stock low' : 'stock'}><span>{formatCount(row[key])} шт.</span></dd></div>)}
      </dl>
    </div>
  </dialog>;
}

function Stat({ icon, label, value, unit }) {
  return <div className="stat"><div><span>{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong></div><div className="stat-icon"><Icon name={icon}/></div></div>;
}

function History({ rows, error, more }) {
  const [filter, setFilter] = useState('all');
  const events = (rows ?? []).filter(row => filter === 'all' || row.action === filter);
  return <><div className="page-head"><div><h1>История изменений</h1><p>Операции с товарами и остатками</p></div></div>
    <section className="panel"><div className="toolbar"><select aria-label="Тип операции" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Все операции</option>{Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <div className="table-wrap"><table><thead><tr><th>Дата · МСК</th><th>Товар / артикул</th><th>Операция</th><th>Изменения</th><th>Автор · UID</th><th>Комментарий</th></tr></thead>
      <tbody>{events.map(row => <tr key={row.id}><td>{fmtDate(row.at)}</td><td><strong>{row.after.name}</strong><code>{row.sku}</code></td><td>{actions[row.action]}</td><td><Change event={row}/></td><td><code>{row.actor}</code></td><td>{row.note || '—'}</td></tr>)}</tbody></table></div>
    {!events.length && <p className="empty">{error || (!rows ? 'Загружаем историю…' : 'Записей пока нет.')}</p>}{more && <div className="table-foot"><button className="button secondary" onClick={more}>Показать более ранние операции</button></div>}</section></>;
}

function Change({ event: { action, before, after } }) {
  if (action === 'transfer') {
    const from = before.office > after.office ? 'office' : 'warehouse';
    const to = from === 'office' ? 'warehouse' : 'office';
    return <>{locations[from]} → {locations[to]} · {before[from] - after[from]} шт.</>;
  }
  if (action === 'edit') {
    const names = { name: 'Название', size: 'Размер', color: 'Цвет', photo: 'Фото', purchase: 'Закупка', retail: 'Розница' };
    return Object.keys(names).filter(key => before[key] !== after[key]).map(key => <div key={key}>{names[key]}{key !== 'photo' && <> · {['purchase','retail'].includes(key) ? money(before[key]) + ' → ' + money(after[key]) : before[key] + ' → ' + after[key]}</>}</div>);
  }
  return Object.keys(locations).filter(key => !before || before[key] !== after[key]).map(key => <div key={key}>{locations[key]} · {before && <>{before[key]} → </>}{after[key]} шт.</div>);
}

function Field({ label, name, required = true, ...props }) {
  return <label className="field"><span>{label}</span><input name={name} required={required} {...props}/></label>;
}

function Operation({ action, row, rows, close, save }) {
  const modal = useRef(null);
  const [sku, setSku] = useState(row?.sku ?? '');
  const [direction, setDirection] = useState('office');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = row || rows.find(item => item.sku === sku);
  const detail = action === 'create' || action === 'edit';
  const fields = row || initialVariant;
  useEffect(() => { modal.current.showModal(); }, []);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = key => String(form.get(key) ?? '').trim();
    const number = key => Number(get(key));
    setBusy(true);
    setError('');
    try {
      let values;
      if (detail) {
        values = { sku: get('sku') || sku, name: get('name'), size: get('size'), color: get('color'), photo: get('photo'), purchase: Math.round(number('purchase') * 100), retail: Math.round(number('retail') * 100), office: number('office'), warehouse: number('warehouse') };
        if (!values.name || !values.size || !values.color) throw new Error('Заполните название, размер и цвет.');
        if (!validPhoto(values.photo, backend.cloud)) throw new Error('Укажите HTTPS-ссылку на изображение из подключённого Cloudinary.');
      } else {
        values = action === 'adjust' ? { location: get('location'), delta: number('delta') } : { from: direction, amount: number('amount') };
      }
      await save(action, action === 'create' ? values.sku : sku, values, get('note'));
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  const heading = { create: 'Добавить товар', edit: 'Редактировать товар', adjust: 'Скорректировать остаток', transfer: 'Переместить товар' }[action];
  return <dialog ref={modal} onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="operation-title"><form onSubmit={submit}>
    <div className="modal-head"><div><h2 id="operation-title">{heading}</h2>{row && <p>{row.name} · {row.sku}</p>}</div><button type="button" className="icon" aria-label="Закрыть" onClick={close} disabled={busy}><Icon name="close"/></button></div>
    {detail ? <>
      <Field name="name" label="Название" maxLength="120" defaultValue={fields.name}/>
      <div className="form-grid"><Field name="sku" label="Артикул" maxLength="64" defaultValue={fields.sku} readOnly={action === 'edit'}/><Field name="size" label="Размер" maxLength="30" defaultValue={fields.size}/></div>
      <Field name="color" label="Цвет" maxLength="60" defaultValue={fields.color}/>
      <Field name="photo" label="Ссылка на фото в Cloudinary" type="url" maxLength="1500" required={false} defaultValue={fields.photo} placeholder="https://res.cloudinary.com/…"/>
      <div className="form-grid"><Field name="purchase" label="Закупочная цена, ₽" type="number" min="0" max="1000000000" step=".01" defaultValue={fields.purchase / 100}/><Field name="retail" label="Розничная цена, ₽" type="number" min="0" max="1000000000" step=".01" defaultValue={fields.retail / 100}/></div>
      {action === 'create' && <div className="form-grid">{Object.entries(locations).map(([key, label]) => <Field key={key} name={key} label={label + ', шт.'} type="number" min="0" max="1000000000" defaultValue="0"/>)}</div>}
    </> : <>
      {!row && <label className="field"><span>Артикул</span><select required value={sku} onChange={event => setSku(event.target.value)}><option value="">Выберите товар</option>{rows.map(item => <option key={item.id} value={item.sku}>{item.name} · {item.sku}</option>)}</select></label>}
      {selected && <p className="balances">Офис <b>{selected.office}</b> · Единый склад <b>{selected.warehouse}</b></p>}
      <div className="form-grid"><label className="field"><span>{action === 'transfer' ? 'Откуда' : 'Локация'}</span><select name="location" value={direction} onChange={event => setDirection(event.target.value)}>{Object.entries(locations).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {action === 'transfer' && <div className="field"><span>Куда</span><div className="readonly">{locations[direction === 'office' ? 'warehouse' : 'office']}</div></div>}</div>
      {action === 'transfer' ? <Field name="amount" label="Количество, шт." type="number" min="1" max={selected?.[direction] ?? 1000000000}/> : <Field name="delta" label="Изменение, шт." type="number" placeholder="Например, 10 или -3"/>}
    </>}
    <label className="field"><span>Комментарий</span><textarea name="note" maxLength="300" rows="2"/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Отмена</button><button className="button primary" disabled={busy}>{busy ? 'Сохраняем…' : action === 'transfer' ? 'Провести перемещение' : 'Сохранить'}</button></div>
  </form></dialog>;
}

function Access({ user }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('reader');
  useEffect(() => backend.observeRows('members', setRows, error => setError(message(error))), []);
  async function change(task, result) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); setNotice(result); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <><div className="page-head"><div><h1>Доступы</h1><p>Назначение ролей по UID из Firebase Authentication</p></div></div>
    <section className="panel"><form className="toolbar access-form" onSubmit={event => {
      event.preventDefault();
      const id = uid.trim();
      if (!/^[^/]{1,128}$/.test(id) || id === user.uid || ['.', '..'].includes(id)) { setError('Укажите UID другого пользователя.'); return; }
      change(() => backend.setRole(id, role), 'Роль сохранена.');
    }}>
      <Field name="uid" label="UID пользователя" value={uid} maxLength="128" onChange={event => setUid(event.target.value)}/>
      <label className="field"><span>Роль</span><select value={role} onChange={event => setRole(event.target.value)}>{Object.entries(roles).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <button className="button primary" disabled={busy}>Назначить роль</button>
    </form>
    {error && <p className="empty error" role="alert">{error}</p>}{notice && <p className="empty" role="status">{notice}</p>}
    <div className="table-wrap"><table><thead><tr><th>UID</th><th>Роль</th><th>Действия</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><code>{row.id}</code></td><td>{roles[row.role]}</td><td>{row.id === user.uid ? 'Ваша учётная запись' : <div className="buttons"><button className="button secondary" onClick={() => { setUid(row.id); setRole(row.role); }}>Изменить</button><button className="button secondary" disabled={busy} onClick={() => { if (window.confirm('Отозвать доступ этого пользователя?')) change(() => backend.removeRole(row.id), 'Доступ отозван.'); }}>Отозвать</button></div>}</td></tr>)}</tbody></table></div>
    </section></>;
}

createRoot(document.getElementById('root')).render(<App/>);
