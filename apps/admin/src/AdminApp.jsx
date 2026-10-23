import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Clock3, UtensilsCrossed, CupSoda, Leaf, Plus, Pencil, X, Check, ImagePlus, LoaderCircle, ChevronDown, ArrowLeft } from 'lucide-react';

const base = import.meta.env.BASE_URL;
const photoUrl = url => url?.startsWith('/menu/') ? base + url.slice(1) : url;
const days = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];
const tabs = [['point', MapPin, 'Заклад'], ['shawarma', UtensilsCrossed, 'Шаурма'], ['drinks', CupSoda, 'Напої']];
async function api(path, method = 'GET', body) {
  const response = await fetch('/api/admin' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Не вдалося зв’язатися із сервером'); }
  if (!response.ok) throw new Error(data.error || 'Не вдалося зберегти зміни');
  return data;
}
function Field({ label, children, ...props }) { return <label className="field"><span>{label}</span>{children || <input {...props} />}</label>; }
function Toggle({ label, checked, onChange, disabled }) { return <label className="toggle"><input type="checkbox" checked={!!checked} onChange={event => onChange(event.target.checked)} disabled={disabled} /><span>{label}</span></label>; }
function Photo({ url, name, className = '' }) { const [failed, setFailed] = useState(null); return <div className={'photo ' + className}>{url && failed !== url ? <img src={photoUrl(url)} alt={name || 'Фото'} loading="lazy" onError={() => setFailed(url)}/> : <ImagePlus size={25} role="img" aria-label="Фото ще не додано"/>}</div>; }
function PhotoPicker({ value, onChange, onBusy }) {
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  return <div className="photo-picker"><Photo url={value} className="photo-preview"/><div><label className={'button secondary upload-button ' + (uploading ? 'disabled' : '')}>
    {uploading ? <LoaderCircle className="spin" size={17}/> : <ImagePlus size={17}/>}{uploading ? 'Завантажуємо…' : value ? 'Змінити фото' : 'Завантажити фото'}
    <input aria-label="Завантажити фото" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      setError('');
      if (file.size > 5 * 1024 * 1024) { setError('Оберіть фото до 5 МБ'); return; }
      setUploading(true); onBusy(true);
      try {
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Не вдалося прочитати файл')); reader.readAsDataURL(file); });
        onChange((await api('/images', 'POST', { data })).imageUrl);
      } catch (error) { setError(error.message); }
      finally { setUploading(false); onBusy(false); }
    }}/>
  </label><p className="hint">JPEG, PNG або WebP · до 5 МБ</p>{value && <button type="button" className="text-button" disabled={uploading} onClick={() => onChange('')}>Прибрати фото</button>}{error && <p role="alert" className="error-text">{error}</p>}</div></div>;
}

export default function AdminApp() {
  const [data, setData] = useState(null), [pointId, setPointId] = useState('demo'), [tab, setTab] = useState('point');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState(''), [modal, setModal] = useState(null);
  const saving = useRef(false);
  const load = async () => { const next = await api('/state'); setData(next); };
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  const mutate = async action => {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError('');
    try { await action(); await load(); setToast('Зміни збережено'); return true; }
    catch (error) { setError(error.message); return false; }
    finally { saving.current = false; setBusy(false); }
  };
  const point = data?.points.find(item => item.id === pointId) || data?.points[0];
  const menu = (data?.menus[point?.id] || []).filter(item => ['Шаурма', 'Напої'].includes(item.category));
  return <div className="admin-shell">
    <header className="site-header"><div className="header-inner"><a className="brand" href={base}><img src={base + 'brand/shaurmisha.jpg'} alt="ШаурМіша"/><div><strong>ШаурМіша</strong><span>Управління закладом</span></div></a><span className="admin-badge">Адміністратор</span></div></header>
    <main className="workspace">
      {error && !modal && <div role="alert" className="notice error">{error}<button aria-label="Закрити повідомлення" onClick={() => setError('')}><X size={17}/></button></div>}
      {!data ? <div className="empty-state"><LoaderCircle className="spin" size={25}/><p>{error ? 'Не вдалося завантажити дані' : 'Завантажуємо заклад…'}</p>{error && <button className="button secondary" onClick={() => { setError(''); load().catch(error => setError(error.message)); }}>Спробувати ще раз</button>}</div> : <>
        <div className="point-heading"><div><p className="eyebrow">Ваш заклад</p><h1>{point.name}</h1><p className="address"><MapPin size={15}/>{point.address}</p></div>{data.points.length > 1 && <label className="point-select"><span className="sr-only">Обрати точку</span><select value={point.id} onChange={event => { setPointId(event.target.value); setError(''); }}>{data.points.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' · неактивна'}</option>)}</select><ChevronDown size={16}/></label>}</div>
        {!point.active && <p className="notice">Ця точка неактивна. Її меню не доступне клієнтам.</p>}
        <nav className="tabs" aria-label="Розділи адмін-панелі">{tabs.map(([id, Icon, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}><Icon size={18}/>{label}</button>)}</nav>
        {tab === 'point' && <PointForm key={point.id + '-' + point.updatedAt} point={point} busy={busy} onSave={body => mutate(() => api(`/points/${point.id}`, 'PATCH', body))}/>}
        {tab !== 'point' && <MenuList key={tab} title={tab === 'shawarma' ? 'Шаурма' : 'Напої'} menu={menu.filter(item => item.category === (tab === 'shawarma' ? 'Шаурма' : 'Напої'))} busy={busy} onCreate={() => setModal({ type: 'product', value: null, category: tab === 'shawarma' ? 'Шаурма' : 'Напої' })} onEdit={value => setModal({ type: 'product', value })} onToggle={(item, field, value) => mutate(() => api(`/points/${point.id}/menu/${item.id}`, 'PATCH', { [field]: value }))}/>}
      </>}
    </main>
    <footer>ШаурМіша · Панель керування</footer>
    {toast && <div role="status" className="toast"><Check size={17}/>{toast}</div>}
    {modal && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">{modal.type === 'ingredient' ? 'Інгредієнти' : point.name}</p><h2 id="modal-title">{modal.type === 'ingredient' ? modal.value ? 'Редагувати інгредієнт' : 'Новий інгредієнт' : modal.value ? 'Редагувати позицію' : 'Нова позиція'}</h2></div><button className="icon-button" disabled={busy} aria-label="Закрити" onClick={() => { setModal(null); setError(''); }}><X size={21}/></button></div>
      {error && <div role="alert" className="notice error">{error}</div>}
      <ProductForm initial={modal.value} category={modal.category} ingredients={data.ingredients} busy={busy} onSaveIngredient={async (body, id) => {
          let saved;
          const ok = await mutate(async () => { saved = await api(id ? `/ingredients/${id}` : '/ingredients', id ? 'PATCH' : 'POST', body); });
          return ok ? saved.ingredient : null;
        }} onSave={async body => {
          if (await mutate(() => modal.value ? api(`/points/${point.id}/menu/${modal.value.id}`, 'PATCH', { product: body, sizes: body.sizes, price: body.price, visible: body.visible, available: body.available, sortOrder: body.sortOrder }) : api(`/points/${point.id}/products`, 'POST', body))) setModal(null);
        }}/><button type="button" disabled={busy} className="cancel-button" onClick={() => { setModal(null); setError(''); }}><ArrowLeft size={15}/>Скасувати</button>
    </section></div>}
  </div>;
}
function PointForm({ point, busy, onSave }) {
  const [value, setValue] = useState(() => structuredClone(point));
  const set = (key, data) => setValue(previous => ({ ...previous, [key]: data }));
  const hours = (index, changes) => set('weeklyHours', value.weeklyHours.map((row, i) => i === index ? { ...row, ...changes } : row));
  return <form className="point-form" onSubmit={event => { event.preventDefault(); const { name, address, phone, description, timeZone, weeklyHours, exceptions } = value; onSave({ name, address, phone, description, timeZone, weeklyHours, exceptions }); }}>
    <section className="panel"><div className="section-heading"><div><h2>Інформація про заклад</h2><p>Ці дані бачать клієнти під час замовлення.</p></div><MapPin size={20}/></div>
      <Field label="Назва" value={value.name} required maxLength={100} onChange={event => set('name', event.target.value)}/>
      <Field label="Адреса" value={value.address} required maxLength={200} onChange={event => set('address', event.target.value)}/>
      <Field label="Телефон" type="tel" value={value.phone} maxLength={50} onChange={event => set('phone', event.target.value)}/>
      <Field label="Опис"><textarea rows={3} maxLength={1500} value={value.description} onChange={event => set('description', event.target.value)}/></Field>
      <Field label="Часовий пояс"><select value={value.timeZone} onChange={event => set('timeZone', event.target.value)}>{[...new Set([value.timeZone, 'Europe/Kyiv'])].map(zone => <option key={zone}>{zone}</option>)}</select></Field>
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Графік роботи</h2><p>Місцевий час закладу. Нічні зміни поки не підтримуються.</p></div><Clock3 size={20}/></div>
      <div className="hours-list">{value.weeklyHours.map((row, index) => <div className="hours-row" key={index}><strong>{days[index]}</strong><label className="day-toggle"><input type="checkbox" checked={!row.closed} onChange={event => hours(index, { closed: !event.target.checked })}/><span>{row.closed ? 'Вихідний' : 'Працюємо'}</span></label><div className="time-range"><input aria-label={`${days[index]}: відкриття`} placeholder="10:00" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" required={!row.closed} disabled={row.closed} value={row.open} onChange={event => hours(index, { open: event.target.value })}/><span>—</span><input aria-label={`${days[index]}: закриття`} placeholder="22:00" pattern="(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)" required={!row.closed} disabled={row.closed} value={row.close} onChange={event => hours(index, { close: event.target.value })}/></div></div>)}</div>
      <details className="exceptions"><summary>Особливі дні {value.exceptions.length ? `(${value.exceptions.length})` : ''}</summary>{value.exceptions.map((row, index) => <div key={index} className="exception-row"><input aria-label="Дата винятку" type="date" required value={row.date} onChange={event => set('exceptions', value.exceptions.map((item, i) => i === index ? { ...item, date: event.target.value } : item))}/><Toggle label="Вихідний" checked={row.closed} onChange={closed => set('exceptions', value.exceptions.map((item, i) => i === index ? { ...item, closed } : item))}/>{!row.closed && <><input aria-label="Відкриття у винятковий день" value={row.open} onChange={event => set('exceptions', value.exceptions.map((item, i) => i === index ? { ...item, open: event.target.value } : item))}/><input aria-label="Закриття у винятковий день" value={row.close} onChange={event => set('exceptions', value.exceptions.map((item, i) => i === index ? { ...item, close: event.target.value } : item))}/></>}<button className="icon-button" type="button" aria-label="Прибрати виняток" onClick={() => set('exceptions', value.exceptions.filter((_, i) => i !== index))}><X size={17}/></button></div>)}<button className="button secondary" type="button" onClick={() => set('exceptions', [...value.exceptions, { date: '', closed: true, open: '10:00', close: '22:00' }])}><Plus size={16}/>Додати день</button></details>
    </section><div className="form-actions"><button className="button primary" disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти зміни'}<Check size={17}/></button></div>
  </form>;
}
function MenuList({ title, menu, busy, onCreate, onEdit, onToggle }) {
  const [showHidden, setShowHidden] = useState(false);
  const shown = menu.filter(item => showHidden || item.visible);
  return <section><div className="section-heading"><div><h2>{title}</h2><p>Фото, ціни та наявність у клієнтському меню.</p></div><button className="button primary" onClick={onCreate}><Plus size={17}/>Позиція</button></div><div className="list-toolbar"><span className="muted">{menu.filter(item => item.visible).length} позицій у меню</span><Toggle label="Показати приховані" checked={showHidden} onChange={setShowHidden}/></div><div className="menu-list">{shown.map(item => <article className="menu-row" key={item.id}><Photo url={item.imageUrl} name={item.name}/><div className="menu-info"><h3>{item.name}</h3><p>{item.category} · {item.sizes?.length ? `${item.sizes.length} ${item.sizes.length === 1 ? 'розмір' : item.sizes.length < 5 ? 'розміри' : 'розмірів'}` : item.weight || 'Одна порція'}</p></div><strong className="price">{item.sizes?.length > 1 ? 'від ' : ''}{item.price} ₴</strong><div className="menu-toggles"><Toggle label="У меню" checked={item.visible} disabled={busy} onChange={value => onToggle(item, 'visible', value)}/><Toggle label="В наявності" checked={item.available} disabled={busy} onChange={value => onToggle(item, 'available', value)}/></div><button className="icon-button" aria-label={`Редагувати ${item.name}`} onClick={() => onEdit(item)}><Pencil size={18}/></button></article>)}</div>{!shown.length && <p className="empty-state">Позицій поки немає. Додайте першу страву або напій.</p>}</section>;
}
function IngredientForm({ initial, busy, onSave, onCancel }) {
  const [value, setValue] = useState(initial || { name: '', imageUrl: '' }), [uploading, setUploading] = useState(false);
  return <div className="ingredient-editor form-stack"><p className="hint">Назва й фото спільні для всіх рецептів. Фото необов’язкове.</p><PhotoPicker value={value.imageUrl} onChange={imageUrl => setValue(current => ({ ...current, imageUrl }))} onBusy={setUploading}/><Field label="Назва інгредієнта" value={value.name} maxLength={100} autoFocus onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} onChange={event => setValue({ ...value, name: event.target.value })}/><div className="ingredient-actions"><button type="button" disabled={busy || uploading || !value.name.trim()} className="button primary" onClick={() => onSave(value)}><Check size={17}/>Зберегти інгредієнт</button><button type="button" disabled={busy || uploading} className="button secondary" onClick={onCancel}>Скасувати</button></div></div>;
}
function ProductForm({ initial, category = 'Шаурма', ingredients, busy, onSave, onSaveIngredient }) {
  const [value, setValue] = useState(() => initial ? structuredClone(initial) : { name: '', category, description: '', price: 0, weight: '', imageUrl: '', sizes: [], ingredientIds: [], visible: true, available: true, sortOrder: 0, hasModifiers: false, availableSpiciness: false, emoji: '🌯', tag: '' });
  const [uploading, setUploading] = useState(false), [addingIngredient, setAddingIngredient] = useState(false), [ingredientEditor, setIngredientEditor] = useState(null);
  const set = (key, data) => setValue(previous => ({ ...previous, [key]: data }));
  const selected = (value.ingredientIds || []).map(id => ingredients.find(item => item.id === id)).filter(Boolean);
  return <form className="form-stack" onSubmit={event => { event.preventDefault(); if (!uploading) onSave(value); }}>
    <PhotoPicker value={value.imageUrl} onChange={url => set('imageUrl', url)} onBusy={setUploading}/>
    <Field label="Назва позиції" autoFocus value={value.name} required maxLength={100} onChange={event => set('name', event.target.value)}/>
    <div className="form-grid"><Field label="Категорія"><select value={value.category} onChange={event => set('category', event.target.value)}><option>Шаурма</option><option>Напої</option></select></Field><Field label="Позначка" value={value.tag} maxLength={50} placeholder="Наприклад, 🔥 Найпопулярніша" onChange={event => set('tag', event.target.value)}/></div>
    <fieldset className="sizes"><legend>Розміри й ціни</legend>{value.sizes.map((size, index) => <div className="size-row" key={size.id}><Field label="Розмір" value={size.name} required maxLength={80} onChange={event => set('sizes', value.sizes.map((item, i) => i === index ? { ...item, name: event.target.value } : item))}/><Field label="Вага" value={size.weight} required maxLength={40} placeholder="350 г" onChange={event => set('sizes', value.sizes.map((item, i) => i === index ? { ...item, weight: event.target.value } : item))}/><Field label="Ціна, ₴" type="number" min="0" max="100000" step="0.01" value={size.price} required onChange={event => set('sizes', value.sizes.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item))}/><button type="button" className="icon-button" aria-label={`Прибрати розмір ${size.name}`} onClick={() => set('sizes', value.sizes.filter((_, i) => i !== index))}><X size={17}/></button></div>)}
      {!value.sizes.length && <div className="form-grid"><Field label="Ціна, ₴" type="number" min="0" max="100000" step="0.01" required value={value.price} onChange={event => set('price', Number(event.target.value))}/><Field label="Вага / об’єм" value={value.weight} maxLength={40} placeholder="450 г / 500 мл" onChange={event => set('weight', event.target.value)}/></div>}
      {value.sizes.length < 10 && <button type="button" className="button secondary" onClick={() => set('sizes', [...value.sizes, { id: crypto.randomUUID(), name: '', weight: '', price: 0 }])}><Plus size={16}/>Розмір</button>}
    </fieldset>
    <fieldset><legend>Склад</legend><div className="recipe-chips">{selected.map(item => <div className="recipe-chip" key={item.id}><Leaf size={16} aria-hidden="true"/>{item.imageUrl && <Photo url={item.imageUrl} name={item.name}/>}<button type="button" className="ingredient-name" disabled={busy} onClick={() => { setIngredientEditor(item); setAddingIngredient(false); }} aria-label={`Редагувати інгредієнт ${item.name}`}>{item.name}<Pencil size={13}/></button><button type="button" className="icon-button" disabled={busy} aria-label={`Прибрати інгредієнт ${item.name}`} onClick={() => set('ingredientIds', value.ingredientIds.filter(id => id !== item.id))}><X size={15}/></button></div>)}</div>
      {!ingredientEditor && <button type="button" className="button secondary" disabled={busy} onClick={() => setAddingIngredient(!addingIngredient)}><Plus size={16}/>Додати інгредієнт</button>}
      {addingIngredient && !ingredientEditor && <div className="ingredient-picker"><p className="hint">Оберіть зі списку або створіть новий.</p><div className="recipe-chips">{ingredients.filter(item => !(value.ingredientIds || []).includes(item.id)).map(item => <button key={item.id} type="button" className="button secondary" onClick={() => { set('ingredientIds', [...(value.ingredientIds || []), item.id]); setAddingIngredient(false); }}><Leaf size={15}/>{item.name}<Plus size={14}/></button>)}</div><button type="button" className="text-button" onClick={() => setIngredientEditor({ name: '', imageUrl: '' })}><Plus size={15}/>Створити новий інгредієнт</button></div>}
      {ingredientEditor && <IngredientForm key={ingredientEditor.id || 'new'} initial={ingredientEditor} busy={busy} onCancel={() => setIngredientEditor(null)} onSave={async body => { const saved = await onSaveIngredient({ name: body.name, imageUrl: body.imageUrl }, ingredientEditor.id); if (saved) { if (!ingredientEditor.id) setValue(current => ({ ...current, ingredientIds: [...(current.ingredientIds || []), saved.id] })); setIngredientEditor(null); setAddingIngredient(false); } }}/>}
    </fieldset>
    <Field label={selected.length ? 'Склад у меню (формується автоматично)' : 'Опис у меню'}><textarea rows={3} maxLength={1500} readOnly={!!selected.length} value={selected.length ? selected.map(item => item.name).join(', ') + '.' : value.description} onChange={event => set('description', event.target.value)}/></Field>
    <div className="form-grid"><Toggle label="Показувати в меню" checked={value.visible} onChange={checked => set('visible', checked)}/><Toggle label="Є в наявності" checked={value.available} onChange={checked => set('available', checked)}/></div>
    <Field label="Порядок у списку" type="number" min="0" max="10000" value={value.sortOrder} required onChange={event => set('sortOrder', Number(event.target.value))}/>
    <button className="button primary wide" disabled={busy || uploading || !!ingredientEditor}>{busy ? 'Зберігаємо…' : 'Зберегти позицію'}<Check size={17}/></button>
  </form>;
}
