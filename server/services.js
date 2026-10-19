import { query, transaction } from './db.js';
import { fail } from './lib/security.js';
import { trend, summarize, feedback, nextPeriod } from './lib/domain.js';
import webpush from 'web-push';
export async function access(user, id, coachOnly = false, db = { query }) {
  const link = (
    await db.query(
      'SELECT l.*,u.name,u.public_id,u.email,c.name AS coach_name FROM links l JOIN users u ON u.id=l.trainee_id JOIN users c ON c.id=l.coach_id WHERE l.id=$1',
      [id],
    )
  ).rows[0];
  if (
    !link ||
    link.status !== 'active' ||
    (link.coach_id !== user.id && (coachOnly || link.trainee_id !== user.id))
  )
    fail(404, 'Связь недоступна');
  return link;
}
export const isCoach = (user, link) => user.id === link.coach_id;
export async function audit(db, user, link, type, id, before, after) {
  await db.query(
    'INSERT INTO audit_events(link_id,actor_id,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',
    [
      link,
      user.id,
      type,
      id,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}
export async function createCard(db, linkId) {
  for (const [i, title] of [
    'Контакты',
    'Цель',
    'Стартовые параметры',
    'Ограничения',
    'Заметки тренера',
  ].entries())
    await db.query(
      'INSERT INTO sections(link_id,title,visible,editable,position) VALUES($1,$2,$3,$3,$4)',
      [linkId, title, title !== 'Заметки тренера', i],
    );
  const section = (
    await db.query("SELECT id FROM sections WHERE link_id=$1 AND title='Стартовые параметры'", [
      linkId,
    ])
  ).rows[0];
  await db.query(
    "INSERT INTO metrics(link_id,section_id,name,unit,direction) VALUES($1,$2,'Вес','кг','down')",
    [linkId, section.id],
  );
}
export async function acceptInvitation(db, user, invite) {
  if (invite.status !== 'pending' || new Date(invite.expires_at) < new Date())
    fail(400, 'Приглашение уже использовано или истекло');
  if (invite.coach_id === user.id) fail(400, 'Нельзя пригласить себя');
  if (invite.target_id && invite.target_id !== user.id)
    fail(403, 'Приглашение предназначено другому человеку');
  const old = (
    await db.query('SELECT * FROM links WHERE coach_id=$1 AND trainee_id=$2', [
      invite.coach_id,
      user.id,
    ])
  ).rows[0];
  const link = (
    await db.query(
      "INSERT INTO links(coach_id,trainee_id) VALUES($1,$2) ON CONFLICT(coach_id,trainee_id) DO UPDATE SET status='active',archived=false RETURNING *",
      [invite.coach_id, user.id],
    )
  ).rows[0];
  if (!old) await createCard(db, link.id);
  if (invite.group_id)
    await db.query(
      'INSERT INTO group_members(group_id,link_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [invite.group_id, link.id],
    );
  await db.query("UPDATE invitations SET status='accepted',target_id=$2 WHERE id=$1", [
    invite.id,
    user.id,
  ]);
  return link;
}
export async function notify(userId, mode, type, body, linkId = null, taskId = null, key = null) {
  const u = (await query('SELECT preferences FROM users WHERE id=$1', [userId])).rows[0];
  if (!u || u.preferences.disabled?.includes(type)) return;
  const added = await query(
    'INSERT INTO notifications(user_id,mode,type,body,link_id,task_id,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id',
    [userId, mode, type, body, linkId, taskId, key],
  );
  if (!added.rowCount || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@coachpro.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subs = (await query('SELECT * FROM push_subscriptions WHERE user_id=$1', [userId])).rows;
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          s.subscription,
          JSON.stringify({ title: 'CoachPRO', body, url: '/' }),
        );
      } catch (e) {
        if ([404, 410].includes(e.statusCode))
          await query('DELETE FROM push_subscriptions WHERE id=$1', [s.id]);
      }
    }),
  );
}
export async function visibleMetrics(user, link, db = { query }) {
  return (
    await db.query(
      'SELECT m.* FROM metrics m LEFT JOIN sections s ON s.id=m.section_id WHERE m.link_id=$1 AND ($2 OR s.visible IS DISTINCT FROM false)',
      [link.id, isCoach(user, link)],
    )
  ).rows;
}
export function redactSummary(summary, visibleIds) {
  const data = {
    ...summary.data,
    metrics: summary.data.metrics.filter((m) => visibleIds.includes(m.id)),
  };
  return { ...summary, data, automatic_text: feedback(data) };
}
export async function card(user, id) {
  const link = await access(user, id);
  const coach = isCoach(user, link);
  const sections = (
    await query(
      'SELECT * FROM sections WHERE link_id=$1 AND ($2 OR visible=true) ORDER BY position,id',
      [id, coach],
    )
  ).rows;
  const metrics = await visibleMetrics(user, link);
  const ids = metrics.map((m) => m.id);
  const entries = (
    await query(
      'SELECT e.*,u.name AS author_name,m.name AS metric_name,m.unit FROM entries e JOIN users u ON u.id=e.author_id JOIN metrics m ON m.id=e.metric_id WHERE e.link_id=$1 AND e.metric_id=ANY($2::uuid[]) ORDER BY e.measured_at DESC',
      [id, ids],
    )
  ).rows;
  const tasks = (await query('SELECT * FROM tasks WHERE link_id=$1 ORDER BY due_at DESC', [id]))
    .rows;
  const reports = (
    await query('SELECT * FROM report_requests WHERE link_id=$1 ORDER BY created_at DESC', [id])
  ).rows;
  // A trainee must not learn private field values via audit history.
  const allowed = [
    ...sections.map((s) => s.id),
    ...ids,
    ...entries.map((e) => e.id),
    ...tasks.map((t) => t.id),
  ];
  const history = (
    await query(
      'SELECT a.*,u.name AS actor_name FROM audit_events a JOIN users u ON u.id=a.actor_id WHERE a.link_id=$1 AND ($2 OR a.entity_id=ANY($3::uuid[])) ORDER BY a.created_at DESC LIMIT 100',
      [id, coach, allowed],
    )
  ).rows;
  // Historical section snapshots can contain text that was private at the time.
  const safeHistory = coach
    ? history
    : history.filter(
        (a) =>
          (a.entity_type !== 'section' ||
            (a.before_data?.visible !== false && a.after_data?.visible !== false)) &&
          (a.entity_type !== 'metric' ||
            [a.before_data, a.after_data].every(
              (snapshot) =>
                !snapshot?.section_id ||
                sections.some((section) => section.id === snapshot.section_id),
            )),
      );
  const summaries = (
    await query(
      'SELECT * FROM summaries WHERE link_id=$1 AND ($2 OR published) ORDER BY created_at DESC',
      [id, coach],
    )
  ).rows;
  return {
    link,
    sections,
    metrics: metrics.map((m) => ({
      ...m,
      trend: trend(
        entries.filter((e) => e.metric_id === m.id),
        m,
      ),
    })),
    entries,
    tasks,
    reports,
    history: safeHistory,
    summaries: coach ? summaries : summaries.map((s) => redactSummary(s, ids)),
  };
}
export async function buildSummary(
  linkId,
  start,
  end,
  published = false,
  key = null,
  metricIds = [],
) {
  return transaction(async (db) => {
    const tasks = (await db.query('SELECT * FROM tasks WHERE link_id=$1', [linkId])).rows;
    // Shared summaries never include coach-private measurements.
    const metrics = (
      await db.query(
        'SELECT m.* FROM metrics m LEFT JOIN sections s ON s.id=m.section_id WHERE m.link_id=$1 AND s.visible IS DISTINCT FROM false',
        [linkId],
      )
    ).rows.filter((m) => !metricIds.length || metricIds.includes(m.id));
    const entries = (
      await db.query('SELECT * FROM entries WHERE link_id=$1 AND deleted_at IS NULL', [linkId])
    ).rows;
    const data = summarize(tasks, entries, metrics, start, end);
    return (
      await db.query(
        'INSERT INTO summaries(link_id,period_start,period_end,data,automatic_text,published,schedule_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(schedule_key) DO NOTHING RETURNING *',
        [linkId, start, end, JSON.stringify(data), feedback(data), published, key],
      )
    ).rows[0];
  });
}
let running = false;
export async function runJobs() {
  if (running) return;
  running = true;
  try {
    const schedules = (await query('SELECT * FROM summary_schedules WHERE next_run<=now()')).rows;
    for (const s of schedules) {
      const links = (
        await query(
          "SELECT l.* FROM links l WHERE l.coach_id=$1 AND l.status='active' AND NOT l.archived AND ($2::uuid IS NULL OR l.id=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.link_id=l.id AND gm.group_id=$3))",
          [s.coach_id, s.link_id, s.group_id],
        )
      ).rows;
      const end = new Date(s.next_run),
        start = new Date(end);
      if (s.frequency === 'month') {
        const day = start.getUTCDate();
        start.setUTCDate(1);
        start.setUTCMonth(start.getUTCMonth() - 1);
        const last = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
        ).getUTCDate();
        start.setUTCDate(Math.min(day, last));
      } else
        start.setUTCDate(
          start.getUTCDate() -
            (s.frequency === 'fortnight' ? 14 : s.frequency === 'custom' ? s.days : 7),
        );
      for (const l of links) {
        const sum = await buildSummary(
          l.id,
          start,
          end,
          s.auto_send,
          `${s.id}:${l.id}:${end.toISOString()}`,
          s.metric_ids,
        );
        if (sum) {
          await notify(l.coach_id, 'coach', 'summary', 'Новая сводка готова', l.id);
          if (s.auto_send)
            await notify(l.trainee_id, 'trainee', 'summary', 'Ваша сводка готова', l.id);
        }
      }
      let next = nextPeriod(end, s.frequency, s.days);
      while (next <= new Date()) next = nextPeriod(next, s.frequency, s.days);
      await query('UPDATE summary_schedules SET next_run=$2 WHERE id=$1', [s.id, next]);
    }
    const users = (await query('SELECT id,preferences FROM users')).rows;
    for (const u of users) {
      const p = u.preferences;
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: p.timezone || 'Asia/Yekaterinburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const v = Object.fromEntries(parts.map((x) => [x.type, x.value]));
      const date = `${v.year}-${v.month}-${v.day}`;
      if (`${v.hour}:${v.minute}` < (p.reminderTime || '09:00')) continue;
      const due = (
        await query(
          "SELECT t.*,l.trainee_id FROM tasks t JOIN links l ON l.id=t.link_id WHERE l.trainee_id=$1 AND l.status='active' AND NOT l.archived AND t.status<>'done' AND (t.due_at AT TIME ZONE $2)::date=$3::date",
          [u.id, p.timezone || 'Asia/Yekaterinburg', date],
        )
      ).rows;
      for (const t of due)
        await notify(
          u.id,
          'trainee',
          'reminder',
          `Сегодня: ${t.title}`,
          t.link_id,
          t.id,
          `task:${t.id}:${date}`,
        );
      const reports = (
        await query(
          "SELECT r.* FROM report_requests r JOIN links l ON l.id=r.link_id WHERE l.trainee_id=$1 AND l.status='active' AND r.submitted_at IS NULL AND (r.due_at AT TIME ZONE $2)::date=$3::date",
          [u.id, p.timezone || 'Asia/Yekaterinburg', date],
        )
      ).rows;
      for (const r of reports)
        await notify(
          u.id,
          'trainee',
          'reminder',
          `Сегодня нужен отчёт: ${r.description}`,
          r.link_id,
          null,
          `report:${r.id}:${date}`,
        );
    }
  } finally {
    running = false;
  }
}
