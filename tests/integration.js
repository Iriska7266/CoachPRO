import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Isolated PostgreSQL database and HTTP server. Never touch development data.
const connection =
  process.env.TEST_DATABASE_URL ||
  `postgresql://coachpro_test:${process.env.TEST_DB_PASSWORD}@127.0.0.1:${process.env.PGPORT || 54329}/coachpro_test`;
if (!new URL(connection).pathname.endsWith('_test'))
  throw new Error('Integration tests require a database ending in _test');
process.env.DATABASE_URL = connection;
process.env.NODE_ENV = 'test';
const { pool } = await import('../server/db.js');
const { migrate } = await import('../server/migrate.js');
const { createApp } = await import('../server/index.js');
const { runJobs } = await import('../server/services.js');
await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await migrate();
const app = await createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const origin = `http://127.0.0.1:${server.address().port}`;
let tests = 0;
const pass = (name) => {
  tests++;
  console.log(`✓ ${name}`);
};
async function request(path, body, who, method) {
  const r = await fetch(origin + '/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      'X-CoachPRO': '1',
      ...(who ? { Cookie: who.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function ok(path, body, who, method) {
  const r = await request(path, body, who, method);
  assert.ok(r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
try {
  const coach = await request('/auth/register', {
    name: 'Тест тренер',
    email: 'coach@example.test',
    password: 'TestPassword42!',
  });
  const trainee = await request('/auth/register', {
    name: 'Тест подопечный',
    email: 'trainee@example.test',
    password: 'TestPassword42!',
  });
  const other = await request('/auth/register', {
    name: 'Чужой тренер',
    email: 'other@example.test',
    password: 'TestPassword42!',
  });
  assert.equal(coach.status, 201);
  pass('Регистрация создаёт сессии');
  assert.equal(
    (await request('/auth/login', { email: 'coach@example.test', password: 'incorrect-pass' }))
      .status,
    401,
  );
  pass('Неверный пароль отклонён');
  const inv = await ok('/invitations', { public_id: trainee.data.public_id }, coach);
  assert.equal(
    (
      await request(
        '/invitations/respond',
        { token: new URL(inv.url).searchParams.get('invite'), accept: true },
        other,
      )
    ).status,
    403,
  );
  const link = await ok(
    '/invitations/respond',
    { token: new URL(inv.url).searchParams.get('invite'), accept: true },
    trainee,
  );
  pass('Приглашение требует подтверждения правильным адресатом');
  assert.equal((await request(`/cards/${link.id}`, null, other)).status, 404);
  assert.equal((await request('/links?mode=coach', null, trainee)).data.length, 0);
  assert.equal((await request('/links?mode=trainee', null, trainee)).data.length, 1);
  pass('Изоляция связей и режимов');
  const card = await ok(`/cards/${link.id}`, null, coach),
    privateSection = card.sections.find((s) => !s.visible),
    publicSection = card.sections.find((s) => s.title === 'Цель');
  await ok(
    `/sections/${privateSection.id}`,
    { ...privateSection, content: 'SECRET COACH NOTE' },
    coach,
    'PUT',
  );
  let view = await ok(`/cards/${link.id}`, null, trainee);
  assert.ok(!JSON.stringify(view).includes('SECRET'));
  assert.ok(!view.sections.some((s) => s.id === privateSection.id));
  assert.equal(
    (
      await request(
        `/sections/${privateSection.id}`,
        { ...privateSection, content: 'hack' },
        trainee,
        'PUT',
      )
    ).status,
    403,
  );
  pass('Скрытые разделы и их история недоступны подопечному');
  await ok(
    `/sections/${publicSection.id}`,
    { ...publicSection, content: 'Первая правка' },
    coach,
    'PUT',
  );
  assert.equal(
    (
      await request(
        `/sections/${publicSection.id}`,
        { ...publicSection, content: 'Потерянная правка' },
        trainee,
        'PUT',
      )
    ).status,
    409,
  );
  pass('Версии защищают от потери правок');
  const metric = card.metrics[0];
  const entry = {
    metric_id: metric.id,
    value: 80,
    measured_at: new Date().toISOString(),
    operation_id: randomUUID(),
    elapsed_ms: 8500,
  };
  const first = await ok(`/cards/${link.id}/entries`, entry, trainee);
  const again = await ok(`/cards/${link.id}/entries`, entry, trainee);
  assert.equal(first.id, again.id);
  assert.equal((await pool.query('SELECT count(*) FROM entries')).rows[0].count, '1');
  pass('Повторная отправка офлайн-записи не создаёт дубль');
  assert.equal(
    (await request(`/cards/${link.id}/entries`, { ...entry, value: 90 }, trainee)).status,
    409,
  );
  pass('Операцию нельзя переиспользовать с другими данными');
  const privateMetric = await ok(
    `/cards/${link.id}/metrics`,
    { name: 'Скрытый показатель', section_id: privateSection.id },
    coach,
  );
  assert.equal(
    (
      await request(
        `/cards/${link.id}/entries`,
        { ...entry, metric_id: privateMetric.id, operation_id: randomUUID() },
        trainee,
      )
    ).status,
    403,
  );
  pass('Права параметров соблюдаются на сервере');
  await ok(`/entries/${first.id}`, { deleted: true }, trainee, 'PATCH');
  view = await ok(`/cards/${link.id}`, null, trainee);
  assert.ok(view.entries[0].deleted_at);
  await ok(`/entries/${first.id}`, { deleted: false }, trainee, 'PATCH');
  pass('Удаление записи обратимо');
  const grp = await ok('/groups', { name: 'Тестовая группа' }, coach);
  await ok(`/groups/${grp.id}/members`, { link_id: link.id }, coach);
  const inv2 = await ok(
    '/invitations',
    { public_id: other.data.public_id, group_id: grp.id },
    coach,
  );
  const link2 = await ok(
    '/invitations/respond',
    { token: new URL(inv2.url).searchParams.get('invite'), accept: true },
    other,
  );
  const ex = {
    id: randomUUID(),
    title: 'Приседания',
    sets: [{ id: randomUUID(), weight: '10', reps: '12', done: false }],
    done: false,
  };
  const assigned = await ok(
    '/tasks',
    {
      group_id: grp.id,
      title: 'Групповая тренировка',
      kind: 'in_person',
      due_at: new Date(Date.now() - 1000).toISOString(),
      exercises: [ex],
    },
    coach,
  );
  assert.equal(assigned.length, 2);
  const task = assigned.find((t) => t.link_id === link.id),
    otherTask = assigned.find((t) => t.link_id === link2.id);
  assert.equal((await request(`/tasks/${otherTask.id}`, null, trainee)).status, 404);
  await ok(`/tasks/${task.id}`, { ...task, status: 'done' }, trainee, 'PUT');
  const unchanged = await ok(`/tasks/${otherTask.id}`, null, other);
  assert.equal(unchanged.status, 'todo');
  pass('Групповые задачи и отметки независимы, чужая задача закрыта');
  assert.equal(
    (await request(`/tasks/${task.id}`, { ...task, title: 'Устаревшая правка' }, coach, 'PUT'))
      .status,
    409,
  );
  pass('Конкурирующая правка задачи отклонена');
  const saved = await ok(`/tasks/${task.id}`, null, coach);
  await ok(`/tasks/${task.id}`, { ...saved, exercises: [] }, trainee, 'PUT');
  const deleted = await ok(`/tasks/${task.id}`, null, coach);
  assert.equal(deleted.exercises[0].deleted, true);
  assert.equal(deleted.exercises[0].actor, 'п');
  pass('Удалённое упражнение остаётся с авторством');
  await ok(`/tasks/${task.id}/comments`, { body: 'Задержусь' }, trainee);
  assert.ok(
    (await ok('/notifications?mode=coach', null, coach)).some((n) => n.type === 'important'),
  );
  pass('Важный комментарий уведомляет тренера');
  const report = await ok(
    `/cards/${link.id}/reports`,
    { description: 'Самочувствие', due_at: new Date().toISOString() },
    coach,
  );
  await ok(`/reports/${report.id}`, { response: 'Всё хорошо' }, trainee, 'PUT');
  pass('Отчёт запрашивается и заполняется');
  const summary = await ok(
    `/cards/${link.id}/summaries`,
    { start: new Date(Date.now() - 86400000).toISOString(), end: new Date().toISOString() },
    coach,
  );
  assert.equal(summary.data.completed, 1);
  assert.ok(!JSON.stringify(summary).includes('Скрытый показатель'));
  assert.equal((await ok('/summaries?mode=trainee', null, trainee)).length, 0);
  await ok(
    `/summaries/${summary.id}`,
    { published: true, personal_comment: 'Хорошая работа' },
    coach,
    'PUT',
  );
  assert.equal((await ok('/summaries?mode=trainee', null, trainee)).length, 1);
  pass('Сводка считает результат, исключает приватное и ждёт одобрения');
  await ok('/schedules', { link_id: link.id, frequency: 'week', auto_send: true }, coach);
  await runJobs();
  await runJobs();
  const total = (await pool.query('SELECT count(*) FROM summaries WHERE schedule_key IS NOT NULL'))
    .rows[0].count;
  assert.equal(total, '1');
  pass('Планировщик собирает сводку без дублей');
  const changedMetric = await ok(
    `/metrics/${metric.id}`,
    { ...metric, direction: 'down', target: 70, target_date: '2027-01-01', version: 1 },
    coach,
    'PUT',
  );
  assert.equal(changedMetric.target_date, '2027-01-01');
  assert.equal(
    (await request(`/metrics/${metric.id}`, { ...metric, version: 1 }, coach, 'PUT')).status,
    409,
  );
  assert.equal(
    (await request(`/metrics/${metric.id}`, { ...changedMetric, target: 50 }, trainee, 'PUT'))
      .status,
    404,
  );
  const auditEvent = (
    await pool.query(
      "SELECT * FROM audit_events WHERE entity_id=$1 AND entity_type='metric' ORDER BY created_at DESC",
      [metric.id],
    )
  ).rows[0];
  const restored = await ok(`/history/${auditEvent.id}/restore`, {}, coach);
  assert.equal(restored.direction, metric.direction);
  assert.equal(restored.target_date, null);
  pass('Настройки показателя, версии, доступ и откат правки');
  await ok(`/metrics/${metric.id}`, { ...restored, section_id: privateSection.id }, coach, 'PUT');
  const hidden = await ok('/summaries?mode=trainee', null, trainee);
  assert.ok(hidden.every((s) => s.data.metrics.every((m) => m.id !== metric.id)));
  assert.ok(hidden.every((s) => !s.automatic_text.includes(metric.name)));
  pass('Ранее опубликованная сводка скрывает ставший приватным показатель');
  assert.equal(
    (
      await request(
        `/cards/${link.id}/entries`,
        { ...entry, client_user_id: coach.data.id },
        trainee,
      )
    ).status,
    403,
  );
  pass('Офлайн-очередь нельзя отправить под другим аккаунтом');
  async function uploadFile(who, bytes, extra = {}) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'check.pdf');
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const r = await fetch(origin + `/api/tasks/${task.id}/attachments`, {
      method: 'POST',
      headers: { Cookie: who.cookie, 'X-CoachPRO': '1' },
      body: form,
    });
    return { status: r.status, data: await r.json() };
  }
  assert.equal((await uploadFile(other, '%PDF-1.4 test')).status, 404);
  assert.equal((await uploadFile(trainee, 'not a PDF')).status, 400);
  const file = await uploadFile(trainee, '%PDF-1.4 test');
  assert.equal(file.status, 201);
  assert.equal((await uploadFile(coach, '%PDF-1.4 duplicate')).status, 400);
  assert.equal(
    (await uploadFile(coach, '%PDF-1.4 set', { exercise_id: ex.id, set_id: ex.sets[0].id })).status,
    201,
  );
  assert.equal((await request(`/attachments/${file.data.id}`, null, other)).status, 404);
  const download = await fetch(origin + `/api/attachments/${file.data.id}`, {
    headers: { Cookie: coach.cookie },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), '%PDF-1.4 test');
  assert.equal((await request(`/tasks/${task.id}/attachments`, {}, other, 'DELETE')).status, 404);
  assert.equal((await ok(`/tasks/${task.id}/attachments`, {}, trainee, 'DELETE')).deleted, 2);
  assert.equal((await request(`/attachments/${file.data.id}`, null, coach)).status, 404);
  pass('Вложения: формат, доступ, лимит на задачу, подход и удаление всех');
  await ok(`/links/${link.id}`, { status: 'left' }, trainee, 'PATCH');
  assert.equal((await request(`/cards/${link.id}`, null, coach)).status, 404);
  assert.equal((await request(`/tasks/${task.id}`, null, trainee)).status, 404);
  pass('Выход из связи закрывает доступ к карточке и задачам');
  const csrf = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'coach@example.test', password: 'TestPassword42!' }),
  });
  assert.equal(csrf.status, 403);
  pass('Запросы изменения требуют защитного заголовка');
  const { digest } = await import('../server/lib/security.js');
  const resetToken = 'a'.repeat(64);
  await pool.query(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
    [digest(resetToken), other.data.id],
  );
  await ok('/auth/reset', { token: resetToken, password: 'NewPassword42!' });
  assert.equal((await request('/me', null, other)).status, 401);
  assert.equal(
    (await request('/auth/reset', { token: resetToken, password: 'AnotherPassword42!' })).status,
    400,
  );
  assert.equal(
    (await request('/auth/login', { email: 'other@example.test', password: 'NewPassword42!' }))
      .status,
    200,
  );
  pass('Сброс пароля одноразовый и отзывает старые сессии');
  console.log(`\n${tests} интеграционных сценариев пройдено на отдельной PostgreSQL.`);
} finally {
  await new Promise((r) => server.close(r));
  await pool.end();
}
