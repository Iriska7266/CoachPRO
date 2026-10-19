import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trend, summarize, nextPeriod, taskStatus } from '../server/lib/domain.js';
const records = (values) =>
  values.map((value, i) => ({
    value,
    measured_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    metric_id: 'm',
  }));
for (const [title, values, direction, expected, target] of [
  ['Снижение веса улучшает результат', [90, 88, 86], 'down', 'up'],
  ['Увеличение веса ухудшает снижение', [80, 82, 85], 'down', 'down'],
  ['Увеличение рабочего веса — рост', [30, 35, 40], 'up', 'up'],
  ['Три почти одинаковые записи — плато', [60, 60.1, 60.2], 'up', 'flat'],
  ['Движение к цели', [100, 95, 90], 'target', 'up', 85],
  ['Переход цели с удалением', [90, 85, 70], 'target', 'down', 85],
  ['Недостаточно данных', [70], 'down', 'unknown'],
  ['Нулевая база', [0, 5], 'up', 'up'],
  ['Стабильность после роста', [10, 20, 20, 20], 'up', 'flat'],
  ['Нет данных', [], 'up', 'unknown'],
])
  test(title, () =>
    assert.equal(trend(records(values), { direction, target, threshold: 1 }).status, expected),
  );
test('Удалённые измерения не влияют на динамику', () => {
  const r = records([100, 95, 130]);
  r[2].deleted_at = '2026-01-03';
  assert.equal(trend(r, { direction: 'down' }).status, 'up');
});
test('Сводка использует полуоткрытый период и независимые статусы', () => {
  const tasks = [
    { due_at: '2026-01-01', status: 'done' },
    { due_at: '2026-01-02', status: 'todo' },
    { due_at: '2026-02-01', status: 'todo' },
  ];
  const s = summarize(
    tasks,
    records([10, 12]),
    [{ id: 'm', direction: 'up' }],
    '2026-01-01',
    '2026-02-01',
  );
  assert.deepEqual([s.total, s.completed, s.missed], [2, 1, 1]);
  assert.equal(s.metrics[0].status, 'up');
});
test('Месяц после 31 января ограничен концом февраля', () =>
  assert.equal(
    nextPeriod('2026-01-31T12:00:00Z', 'month').toISOString(),
    '2026-02-28T12:00:00.000Z',
  ));
test('Выполненная задача не становится просроченной', () =>
  assert.equal(taskStatus({ status: 'done', due_at: '2020-01-01' }), 'done'));
test('План учитывает расстояние до цели и даты замеров', () => {
  const metric = { direction: 'down', target: 70, target_date: '2026-01-10', threshold: 1 };
  const r = [
    { value: 90, measured_at: '2026-01-01' },
    { value: 85, measured_at: '2026-01-06' },
  ];
  assert.equal(trend(r, metric).plan.status, 'behind');
  r[1].value = 75;
  assert.equal(trend(r, metric).plan.status, 'ahead');
  r[1].value = 80;
  assert.equal(trend(r, metric).plan.status, 'on_track');
});
test('Просроченный план не продолжается за целевое значение', () => {
  const r = [
    { value: 90, measured_at: '2026-01-01' },
    { value: 70, measured_at: '2026-02-06' },
  ];
  assert.equal(trend(r, { target: 70, target_date: '2026-01-10' }).plan.expected, 70);
  assert.equal(trend(r, { target: 70, target_date: '2025-01-10' }).plan, null);
});
