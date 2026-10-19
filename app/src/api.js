export async function api(path, body, method) {
  const form = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'X-CoachPRO': '1',
      ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const value = await res.json().catch(() => ({ error: 'Сервер вернул неверный ответ' }));
  if (!res.ok) {
    const error = new Error(value.error || 'Ошибка запроса');
    error.status = res.status;
    throw error;
  }
  return value;
}
const db = new Promise((resolve, reject) => {
  const r = indexedDB.open('coachpro-offline', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('queue', { keyPath: 'id' });
    r.result.createObjectStore('cache', { keyPath: 'id' });
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function store(name, mode, op) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const tx = database.transaction(name, mode);
    const req = op(tx.objectStore(name));
    let result;
    req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
export const cachePut = (id, value) => store('cache', 'readwrite', (s) => s.put({ id, value }));
export const cacheGet = async (id) => (await store('cache', 'readonly', (s) => s.get(id)))?.value;
export const queued = async (user) =>
  (await store('queue', 'readonly', (s) => s.getAll())).filter((q) => q.user === user);
export const enqueue = (user, link, body) =>
  store('queue', 'readwrite', (s) => s.put({ id: body.operation_id, user, link, body }));
let flushing = false;
export async function flush(user) {
  if (flushing) return { sent: 0 };
  flushing = true;
  let sent = 0;
  try {
    const current = await api('/me');
    if (current.id !== user)
      return { sent, error: 'Аккаунт изменился. Войдите в аккаунт автора записей.' };
    for (const q of await queued(user)) {
      try {
        await api(`/cards/${q.link}/entries`, q.body);
        await store('queue', 'readwrite', (s) => s.delete(q.id));
        sent++;
      } catch (e) {
        if (!e.status) break;
        return { sent, error: e.message };
      }
    }
    return { sent };
  } catch (e) {
    return { sent, error: e.status ? e.message : undefined };
  } finally {
    flushing = false;
  }
}
