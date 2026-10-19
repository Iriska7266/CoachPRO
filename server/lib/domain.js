export function trend(entries, metric) {
  const values = entries
    .filter((e) => !e.deleted_at && Number.isFinite(Number(e.value)))
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
  if (values.length < 2) return { status: 'unknown', delta: null, percent: null };
  const first = Number(values[0].value),
    last = Number(values.at(-1).value),
    delta = last - first;
  const percent = first === 0 ? null : (delta / Math.abs(first)) * 100;
  const recent = values.slice(-3).map((e) => Number(e.value));
  const band = (Math.max(Math.abs(recent[0]), 1) * (metric.threshold ?? 1)) / 100;
  const stable = recent.length >= 3 && Math.max(...recent) - Math.min(...recent) <= band;
  const movement =
    metric.direction === 'down'
      ? -delta
      : metric.direction === 'target'
        ? Math.abs(first - metric.target) - Math.abs(last - metric.target)
        : delta;
  const tolerance = (Math.max(Math.abs(first), 1) * (metric.threshold ?? 1)) / 100;
  return {
    status: stable || Math.abs(movement) <= tolerance ? 'flat' : movement > 0 ? 'up' : 'down',
    delta,
    percent,
    first,
    last,
    target: metric.target,
    plan: comparePlan(values, metric),
  };
}
export function taskStatus(task, now = new Date()) {
  return task.status === 'done' ? 'done' : new Date(task.due_at) < now ? 'overdue' : task.status;
}
export function summarize(tasks, entries, metrics, start, end) {
  const lo = +new Date(start),
    hi = +new Date(end);
  const selected = tasks.filter((t) => +new Date(t.due_at) >= lo && +new Date(t.due_at) < hi);
  return {
    completed: selected.filter((t) => t.status === 'done').length,
    missed: selected.filter(
      (t) => t.status !== 'done' && +new Date(t.due_at) < Math.min(hi, Date.now()),
    ).length,
    total: selected.length,
    overdue: tasks
      .filter((t) => t.status !== 'done' && +new Date(t.due_at) < Math.min(hi, Date.now()))
      .map((t) => ({ id: t.id, title: t.title, due_at: t.due_at })),
    metrics: metrics.map((m) => ({
      ...m,
      ...trend(
        entries.filter(
          (e) =>
            e.metric_id === m.id && +new Date(e.measured_at) >= lo && +new Date(e.measured_at) < hi,
        ),
        m,
      ),
    })),
  };
}
export function nextPeriod(date, frequency, days = 7) {
  const d = new Date(date);
  if (frequency === 'month') {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else
    d.setUTCDate(
      d.getUTCDate() + (frequency === 'fortnight' ? 14 : frequency === 'custom' ? days : 7),
    );
  return d;
}
export function feedback(data) {
  return `За период выполнено тренировок: ${data.completed} из ${data.total}. Пропущено: ${data.missed}. ${data.metrics
    .filter((m) => m.status !== 'unknown')
    .map(
      (m) =>
        `${m.name}: ${{ up: 'результат растёт', flat: 'без заметных изменений', down: 'результат снижается' }[m.status]}.`,
    )
    .join(' ')}`;
}

// Linear plan from the first dated measurement to the goal date (end of day UTC).
export function comparePlan(values, metric) {
  if (!metric.target_date || metric.target == null || values.length < 2) return null;
  const start = +new Date(values[0].measured_at);
  const end = +new Date(metric.target_date + 'T23:59:59.999Z');
  if (!Number.isFinite(end) || end <= start) return null;
  const first = Number(values[0].value),
    last = Number(values.at(-1).value);
  const progress = Math.min(
    1,
    Math.max(0, (+new Date(values.at(-1).measured_at) - start) / (end - start)),
  );
  const expected = first + (metric.target - first) * progress;
  const tolerance = (Math.max(Math.abs(expected), 1) * (metric.threshold ?? 1)) / 100;
  const remaining = Math.abs(last - metric.target),
    planned = Math.abs(expected - metric.target);
  return {
    expected,
    status:
      Math.abs(remaining - planned) <= tolerance
        ? 'on_track'
        : remaining < planned
          ? 'ahead'
          : 'behind',
    date: metric.target_date,
  };
}
