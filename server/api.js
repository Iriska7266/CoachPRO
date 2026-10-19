import express from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { mkdirSync, createReadStream } from 'node:fs';
import { unlink, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { query, transaction } from './db.js';
import { token, digest, hashPassword, checkPassword, fail } from './lib/security.js';
import * as V from './lib/validation.js';
import {
  access,
  isCoach,
  audit,
  acceptInvitation,
  notify,
  card,
  buildSummary,
  redactSummary,
  visibleMetrics,
} from './services.js';
import { trend } from './lib/domain.js';
export const api = express.Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
});
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  public_id: u.public_id,
  preferences: u.preferences,
});
async function session(res, id) {
  const t = token();
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(t), id],
  );
  res.cookie('coachpro_session', t, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 604800000,
    path: '/',
  });
}
api.get('/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, database: 'PostgreSQL' });
});
api.post('/auth/register', authLimit, async (req, res) => {
  const b = V.register.parse(req.body);
  const u = (
    await query(
      'INSERT INTO users(public_id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING *',
      [`CP-${token().slice(0, 8).toUpperCase()}`, b.name, b.email, await hashPassword(b.password)],
    )
  ).rows[0];
  await session(res, u.id);
  res.status(201).json(safeUser(u));
});
api.post('/auth/login', authLimit, async (req, res) => {
  const b = V.auth.parse(req.body);
  const u = (await query('SELECT * FROM users WHERE email=$1', [b.email])).rows[0];
  if (!u || !(await checkPassword(b.password, u.password_hash)))
    fail(401, 'Неверная почта или пароль');
  await session(res, u.id);
  res.json(safeUser(u));
});
api.post('/auth/forgot', authLimit, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST)
    fail(503, 'Отправка писем ещё не настроена');
  const email = z.email().parse(req.body.email).toLowerCase();
  const u = (await query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  if (u) {
    const t = token();
    await query(
      "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
      [digest(t), u.id],
    );
    const url = `${process.env.APP_ORIGIN || 'http://localhost:3000'}/?reset=${t}`;
    if (process.env.SMTP_HOST) {
      await nodemailer
        .createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_PORT === '465',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
        })
        .sendMail({
          from: process.env.MAIL_FROM || 'CoachPRO <noreply@coachpro.local>',
          to: u.email,
          subject: 'Восстановление доступа CoachPRO',
          text: `Ссылка действует 30 минут: ${url}`,
        });
    } else if (process.env.NODE_ENV !== 'production') {
      mkdirSync('.local/mail', { recursive: true });
      await writeFile(
        `.local/mail/${u.id}.txt`,
        `Кому: ${u.email}\nВосстановление доступа: ${url}`,
        { mode: 0o600 },
      );
    }
  }
  res.json({
    message:
      'Если аккаунт существует, инструкция подготовлена. В локальной версии без SMTP письмо находится в .local/mail.',
  });
});
api.post('/auth/reset', authLimit, async (req, res) => {
  const b = z
    .object({ token: z.string().length(64), password: V.auth.shape.password })
    .parse(req.body);
  const hash = await hashPassword(b.password);
  await transaction(async (db) => {
    const t = (
      await db.query(
        'DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING *',
        [digest(b.token)],
      )
    ).rows[0];
    if (!t) fail(400, 'Ссылка истекла или уже использована');
    await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [t.user_id, hash]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [t.user_id]);
    await db.query('DELETE FROM password_resets WHERE user_id=$1', [t.user_id]);
  });
  res.json({ ok: true });
});
api.get('/invitation/:token', async (req, res) => {
  const i = (
    await query(
      "SELECT i.id,i.target_id,i.expires_at,u.name AS coach_name,g.name AS group_name FROM invitations i JOIN users u ON u.id=i.coach_id LEFT JOIN groups g ON g.id=i.group_id WHERE i.token_hash=$1 AND i.status='pending' AND i.expires_at>now()",
      [digest(req.params.token)],
    )
  ).rows[0];
  if (!i) fail(404, 'Приглашение недоступно');
  res.json(i);
});
api.use(async (req, res, next) => {
  const s = req.cookies.coachpro_session;
  const u = s
    ? (
        await query(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
          [digest(s)],
        )
      ).rows[0]
    : null;
  if (!u) fail(401, 'Войдите в аккаунт');
  req.user = u;
  next();
});
api.get('/me', (req, res) =>
  res.json({
    ...safeUser(req.user),
    pushKey: process.env.VAPID_PUBLIC_KEY || null,
    local: process.env.NODE_ENV !== 'production',
  }),
);
api.post('/auth/logout', async (req, res) => {
  await query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies.coachpro_session)]);
  res.clearCookie('coachpro_session', { path: '/' });
  res.json({ ok: true });
});
api.put('/preferences', async (req, res) => {
  const b = V.preferences.parse(req.body);
  await query('UPDATE users SET preferences=$2 WHERE id=$1', [req.user.id, JSON.stringify(b)]);
  res.json(b);
});
api.post('/push', async (req, res) => {
  const b = z
    .object({
      endpoint: z.url().refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === 'https:' &&
          (['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(u.hostname) ||
            u.hostname.endsWith('.push.apple.com') ||
            u.hostname.endsWith('.notify.windows.com'))
        );
      }),
      keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
    })
    .parse(req.body);
  await query(
    'INSERT INTO push_subscriptions(user_id,subscription) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [req.user.id, JSON.stringify(b)],
  );
  res.json({ ok: true });
});
api.get('/links', async (req, res) => {
  const mode = req.query.mode === 'trainee' ? 'trainee' : 'coach';
  const links = (
    await query(
      `SELECT l.*,u.name,u.public_id,c.name AS coach_name FROM links l JOIN users u ON u.id=l.trainee_id JOIN users c ON c.id=l.coach_id WHERE l.${mode === 'coach' ? 'coach_id' : 'trainee_id'}=$1 AND l.status='active' ORDER BY l.created_at DESC`,
      [req.user.id],
    )
  ).rows;
  for (const l of links) {
    const d = await card(req.user, l.id);
    l.goal = d.sections.find((s) => s.title === 'Цель')?.content || 'Цель пока не указана';
    l.trend = l.manual_trend || d.metrics[0]?.trend.status || 'unknown';
    l.metrics = d.metrics;
    l.last_entry = d.entries.find((e) => !e.deleted_at)?.measured_at || null;
    l.pending_tasks = d.tasks.filter((t) => t.status !== 'done').length;
    l.overdue = d.tasks.filter(
      (t) => t.status !== 'done' && new Date(t.due_at) < new Date(),
    ).length;
    l.group_ids = (
      await query('SELECT group_id FROM group_members WHERE link_id=$1', [l.id])
    ).rows.map((x) => x.group_id);
  }
  res.json(links);
});
api.patch('/links/:id', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id));
  if (req.body.status === 'left') {
    await query("UPDATE links SET status='left' WHERE id=$1", [l.id]);
  } else {
    if (!isCoach(req.user, l)) fail(403, 'Доступно только тренеру');
    const b = z
      .object({
        archived: z.boolean().optional(),
        manual_trend: z.enum(['up', 'flat', 'down']).nullable().optional(),
      })
      .parse(req.body);
    await query(
      'UPDATE links SET archived=COALESCE($2,archived),manual_trend=CASE WHEN $3 THEN $4 ELSE manual_trend END WHERE id=$1',
      [l.id, b.archived, b.manual_trend !== undefined, b.manual_trend],
    );
  }
  res.json({ ok: true });
});
api.post('/invitations', async (req, res) => {
  const b = z
    .object({ public_id: z.string().max(30).optional(), group_id: V.uuid.nullable().optional() })
    .parse(req.body);
  if (
    b.group_id &&
    !(
      await query('SELECT 1 FROM groups WHERE id=$1 AND coach_id=$2 AND NOT archived', [
        b.group_id,
        req.user.id,
      ])
    ).rowCount
  )
    fail(404, 'Группа недоступна');
  let target = null;
  if (b.public_id) {
    target = (
      await query('SELECT id FROM users WHERE public_id=$1', [b.public_id.toUpperCase().trim()])
    ).rows[0]?.id;
    if (!target) fail(404, 'Пользователь с таким ID не найден');
    if (target === req.user.id) fail(400, 'Нельзя пригласить себя');
  }
  const t = token();
  const i = (
    await query(
      'INSERT INTO invitations(coach_id,target_id,group_id,token_hash) VALUES($1,$2,$3,$4) RETURNING id',
      [req.user.id, target, b.group_id || null, digest(t)],
    )
  ).rows[0];
  res
    .status(201)
    .json({ ...i, url: `${process.env.APP_ORIGIN || 'http://localhost:3000'}/?invite=${t}` });
});
api.get('/invitations', async (req, res) =>
  res.json(
    (
      await query(
        "SELECT i.id,i.expires_at,u.name AS coach_name,g.name AS group_name FROM invitations i JOIN users u ON u.id=i.coach_id LEFT JOIN groups g ON g.id=i.group_id WHERE i.target_id=$1 AND i.status='pending' AND i.expires_at>now()",
        [req.user.id],
      )
    ).rows,
  ),
);
api.post('/invitations/respond', async (req, res) => {
  const b = z
    .object({ id: V.uuid.optional(), token: z.string().length(64).optional(), accept: z.boolean() })
    .refine((x) => x.id || x.token)
    .parse(req.body);
  const result = await transaction(async (db) => {
    const i = (
      await db.query(
        'SELECT * FROM invitations WHERE ' +
          (b.token ? 'token_hash=$1' : 'id=$1 AND target_id=$2') +
          ' FOR UPDATE',
        b.token ? [digest(b.token)] : [b.id, req.user.id],
      )
    ).rows[0];
    if (!i) fail(404, 'Приглашение не найдено');
    if (b.accept) return acceptInvitation(db, req.user, i);
    if (i.target_id && i.target_id !== req.user.id) fail(403, 'Нет доступа');
    await db.query("UPDATE invitations SET status='declined',target_id=$2 WHERE id=$1", [
      i.id,
      req.user.id,
    ]);
    return { ok: true };
  });
  res.json(result);
});
api.get('/groups', async (req, res) =>
  res.json(
    (
      await query(
        "SELECT g.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',u.name)) FROM group_members gm JOIN links l ON l.id=gm.link_id JOIN users u ON u.id=l.trainee_id WHERE gm.group_id=g.id AND l.status='active'),'[]'::jsonb) AS members FROM groups g WHERE coach_id=$1 ORDER BY name",
        [req.user.id],
      )
    ).rows,
  ),
);
api.post('/groups', async (req, res) => {
  const b = V.group.parse(req.body);
  res
    .status(201)
    .json(
      (
        await query(
          'INSERT INTO groups(coach_id,name,notes,schedule) VALUES($1,$2,$3,$4) RETURNING *',
          [req.user.id, b.name, b.notes, b.schedule],
        )
      ).rows[0],
    );
});
api.put('/groups/:id', async (req, res) => {
  const b = V.group.parse(req.body);
  const result = await query(
    'UPDATE groups SET name=$3,notes=$4,schedule=$5,archived=$6 WHERE id=$1 AND coach_id=$2 RETURNING *',
    [V.uuid.parse(req.params.id), req.user.id, b.name, b.notes, b.schedule, b.archived],
  );
  if (!result.rowCount) fail(404, 'Группа не найдена');
  res.json(result.rows[0]);
});
api.post('/groups/:id/members', async (req, res) => {
  const id = V.uuid.parse(req.params.id),
    b = z.object({ link_id: V.uuid, remove: z.boolean().default(false) }).parse(req.body);
  await access(req.user, b.link_id, true);
  if (
    !(await query('SELECT 1 FROM groups WHERE id=$1 AND coach_id=$2', [id, req.user.id])).rowCount
  )
    fail(404, 'Группа недоступна');
  if (b.remove)
    await query('DELETE FROM group_members WHERE group_id=$1 AND link_id=$2', [id, b.link_id]);
  else
    await query('INSERT INTO group_members VALUES($1,$2) ON CONFLICT DO NOTHING', [id, b.link_id]);
  res.json({ ok: true });
});
api.get('/cards/:id', async (req, res) =>
  res.json(await card(req.user, V.uuid.parse(req.params.id))),
);
api.post('/cards/:id/sections', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id), true);
  const b = V.section.parse(req.body);
  const s = await transaction(async (db) => {
    const s = (
      await db.query(
        'INSERT INTO sections(link_id,title,content,visible,editable) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [l.id, b.title, b.content, b.visible, b.editable],
      )
    ).rows[0];
    await audit(db, req.user, l.id, 'section', s.id, null, s);
    return s;
  });
  res.status(201).json(s);
});
api.put('/sections/:id', async (req, res) => {
  const id = V.uuid.parse(req.params.id);
  res.json(
    await transaction(async (db) => {
      const old = (await db.query('SELECT * FROM sections WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) fail(404, 'Раздел не найден');
      const l = await access(req.user, old.link_id, false, db);
      const coach = isCoach(req.user, l);
      if (!coach && (!old.visible || !old.editable)) fail(403, 'Раздел доступен только тренеру');
      const b = V.section.parse(req.body);
      if (
        !coach &&
        (b.visible !== old.visible || b.editable !== old.editable || b.title !== old.title)
      )
        fail(403, 'Настройки раздела меняет тренер');
      const version = z.number().int().parse(req.body.version);
      if (version !== old.version) fail(409, 'Раздел уже изменён. Обновите страницу.');
      const s = (
        await db.query(
          'UPDATE sections SET title=$2,content=$3,visible=$4,editable=$5,version=version+1 WHERE id=$1 RETURNING *',
          [id, b.title, b.content, b.visible, b.editable],
        )
      ).rows[0];
      await audit(db, req.user, l.id, 'section', id, old, s);
      return s;
    }),
  );
});
api.post('/history/:id/restore', async (req, res) => {
  res.json(
    await transaction(async (db) => {
      const a = (
        await db.query('SELECT * FROM audit_events WHERE id=$1', [V.uuid.parse(req.params.id)])
      ).rows[0];
      if (!a || !['section', 'metric'].includes(a.entity_type) || !a.before_data)
        fail(400, 'Эту правку нельзя откатить');
      await access(req.user, a.link_id, true, db);
      if (a.entity_type === 'metric') {
        const old = (await db.query('SELECT * FROM metrics WHERE id=$1 FOR UPDATE', [a.entity_id]))
            .rows[0],
          b = a.before_data;
        const m = (
          await db.query(
            'UPDATE metrics SET name=$2,unit=$3,direction=$4,target=$5,threshold=$6,owner=$7,section_id=$8,target_date=$9,version=version+1 WHERE id=$1 RETURNING *',
            [
              a.entity_id,
              b.name,
              b.unit,
              b.direction,
              b.target,
              b.threshold,
              b.owner,
              b.section_id,
              b.target_date || null,
            ],
          )
        ).rows[0];
        await audit(db, req.user, a.link_id, 'metric', m.id, old, m);
        return m;
      }
      const old = (await db.query('SELECT * FROM sections WHERE id=$1 FOR UPDATE', [a.entity_id]))
        .rows[0];
      const b = a.before_data;
      const s = (
        await db.query(
          'UPDATE sections SET title=$2,content=$3,visible=$4,editable=$5,version=version+1 WHERE id=$1 RETURNING *',
          [a.entity_id, b.title, b.content, b.visible, b.editable],
        )
      ).rows[0];
      await audit(db, req.user, a.link_id, 'section', a.entity_id, old, s);
      return s;
    }),
  );
});
api.post('/cards/:id/metrics', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id), true);
  const b = V.metric.parse(req.body);
  if (
    b.section_id &&
    !(await query('SELECT 1 FROM sections WHERE id=$1 AND link_id=$2', [b.section_id, l.id]))
      .rowCount
  )
    fail(400, 'Раздел не принадлежит карточке');
  const m = (
    await query(
      'INSERT INTO metrics(link_id,section_id,name,unit,direction,target,threshold,owner,current_value,target_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [
        l.id,
        b.section_id || null,
        b.name,
        b.unit,
        b.direction,
        b.target,
        b.threshold,
        b.owner,
        b.current_value,
        b.target_date,
      ],
    )
  ).rows[0];
  res.status(201).json(m);
});
api.put('/metrics/:id', async (req, res) => {
  const b = V.metric.parse(req.body),
    version = z.number().int().parse(req.body.version);
  res.json(
    await transaction(async (db) => {
      const old = (
        await db.query('SELECT * FROM metrics WHERE id=$1 FOR UPDATE', [
          V.uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (!old) fail(404, 'Показатель не найден');
      await access(req.user, old.link_id, true, db);
      if (version !== old.version) fail(409, 'Показатель уже изменён. Обновите карточку.');
      if (
        b.section_id &&
        !(
          await db.query('SELECT 1 FROM sections WHERE id=$1 AND link_id=$2', [
            b.section_id,
            old.link_id,
          ])
        ).rowCount
      )
        fail(400, 'Раздел не принадлежит карточке');
      const m = (
        await db.query(
          'UPDATE metrics SET section_id=$2,name=$3,unit=$4,direction=$5,target=$6,threshold=$7,owner=$8,target_date=$9,version=version+1 WHERE id=$1 RETURNING *',
          [
            old.id,
            b.section_id || null,
            b.name,
            b.unit,
            b.direction,
            b.target,
            b.threshold,
            b.owner,
            b.target_date,
          ],
        )
      ).rows[0];
      await audit(db, req.user, old.link_id, 'metric', m.id, old, m);
      return m;
    }),
  );
});
api.post('/cards/:id/entries', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id));
  const b = V.entry.parse(req.body);
  if (req.body.client_user_id && req.body.client_user_id !== req.user.id)
    fail(403, 'Запись создана в другом аккаунте');
  res.status(201).json(
    await transaction(async (db) => {
      const m = (
        await db.query(
          'SELECT m.*,s.visible,s.editable FROM metrics m LEFT JOIN sections s ON s.id=m.section_id WHERE m.id=$1 AND m.link_id=$2',
          [b.metric_id, l.id],
        )
      ).rows[0];
      if (!m) fail(400, 'Показатель не найден');
      if (
        !isCoach(req.user, l) &&
        (m.owner === 'trainer' || m.visible === false || m.editable === false)
      )
        fail(403, 'Этот показатель заполняет тренер');
      if (
        b.task_id &&
        !(await db.query('SELECT 1 FROM tasks WHERE id=$1 AND link_id=$2', [b.task_id, l.id]))
          .rowCount
      )
        fail(400, 'Задача не принадлежит карточке');
      const existing = (
        await db.query('SELECT * FROM entries WHERE author_id=$1 AND operation_id=$2', [
          req.user.id,
          b.operation_id,
        ])
      ).rows[0];
      if (existing) {
        if (
          existing.link_id !== l.id ||
          existing.metric_id !== b.metric_id ||
          Number(existing.value) !== b.value
        )
          fail(409, 'Идентификатор уже использован');
        return existing;
      }
      const e = (
        await db.query(
          'INSERT INTO entries(link_id,metric_id,task_id,value,measured_at,author_id,operation_id,elapsed_ms,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(author_id,operation_id) DO NOTHING RETURNING *',
          [
            l.id,
            b.metric_id,
            b.task_id,
            b.value,
            b.measured_at,
            req.user.id,
            b.operation_id,
            b.elapsed_ms,
            b.note,
          ],
        )
      ).rows[0];
      if (!e) {
        const prior = (
          await db.query('SELECT * FROM entries WHERE author_id=$1 AND operation_id=$2', [
            req.user.id,
            b.operation_id,
          ])
        ).rows[0];
        if (
          prior.link_id !== l.id ||
          prior.metric_id !== b.metric_id ||
          Number(prior.value) !== b.value
        )
          fail(409, 'Идентификатор уже использован');
        return prior;
      }
      await audit(db, req.user, l.id, 'entry', e.id, null, e);
      return e;
    }),
  );
});
api.patch('/entries/:id', async (req, res) => {
  const deleted = z.boolean().parse(req.body.deleted);
  res.json(
    await transaction(async (db) => {
      const e = (
        await db.query('SELECT * FROM entries WHERE id=$1 FOR UPDATE', [
          V.uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (!e) fail(404, 'Запись не найдена');
      const l = await access(req.user, e.link_id, false, db);
      if (!isCoach(req.user, l)) {
        if (e.author_id !== req.user.id) fail(403, 'Можно удалить только свою запись');
        const m = (
          await db.query(
            'SELECT m.owner,s.visible,s.editable FROM metrics m LEFT JOIN sections s ON s.id=m.section_id WHERE m.id=$1',
            [e.metric_id],
          )
        ).rows[0];
        if (m.owner === 'trainer' || m.visible === false || m.editable === false)
          fail(403, 'Показатель доступен только тренеру');
      }
      const changed = (
        await db.query(
          'UPDATE entries SET deleted_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1 RETURNING *',
          [e.id, deleted],
        )
      ).rows[0];
      await audit(db, req.user, l.id, 'entry', e.id, e, changed);
      return changed;
    }),
  );
});
api.get('/templates', async (req, res) =>
  res.json(
    (await query('SELECT * FROM templates WHERE owner_id=$1 ORDER BY name', [req.user.id])).rows,
  ),
);
api.post('/templates', async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(100),
      kind: z.enum(['task', 'card']),
      data: z.unknown(),
    })
    .parse(req.body);
  if (b.kind === 'task') b.data = V.task.shape.exercises.parse(b.data);
  else
    b.data = z
      .array(
        z.object({
          title: V.section.shape.title,
          visible: z.boolean(),
          editable: z.boolean(),
          metrics: z.array(V.metric),
        }),
      )
      .max(100)
      .parse(b.data);
  res
    .status(201)
    .json(
      (
        await query(
          'INSERT INTO templates(owner_id,name,kind,data) VALUES($1,$2,$3,$4) RETURNING *',
          [req.user.id, b.name, b.kind, JSON.stringify(b.data)],
        )
      ).rows[0],
    );
});
api.post('/cards/:id/apply-template', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id), true);
  const t = (
    await query("SELECT * FROM templates WHERE id=$1 AND owner_id=$2 AND kind='card'", [
      V.uuid.parse(req.body.template_id),
      req.user.id,
    ])
  ).rows[0];
  if (!t) fail(404, 'Шаблон не найден');
  await transaction(async (db) => {
    for (const s of t.data) {
      const row = (
        await db.query(
          'INSERT INTO sections(link_id,title,visible,editable) VALUES($1,$2,$3,$4) RETURNING id',
          [l.id, s.title, s.visible, s.editable],
        )
      ).rows[0];
      for (const m of s.metrics)
        await db.query(
          'INSERT INTO metrics(link_id,section_id,name,unit,direction,target,threshold,owner) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [l.id, row.id, m.name, m.unit, m.direction, m.target, m.threshold, m.owner],
        );
    }
  });
  res.json({ ok: true });
});
api.get('/tasks', async (req, res) => {
  const role = req.query.mode === 'trainee' ? 'trainee_id' : 'coach_id';
  res.json(
    (
      await query(
        `SELECT t.*,u.name,l.coach_id,l.trainee_id FROM tasks t JOIN links l ON l.id=t.link_id JOIN users u ON u.id=l.trainee_id WHERE l.${role}=$1 AND l.status='active' AND NOT l.archived ORDER BY t.due_at`,
        [req.user.id],
      )
    ).rows,
  );
});
api.post('/tasks', async (req, res) => {
  const b = V.task.parse(req.body);
  const scope = z
    .object({ link_id: V.uuid.optional(), group_id: V.uuid.optional() })
    .refine((v) => Boolean(v.link_id) !== Boolean(v.group_id), 'Выберите человека или группу')
    .parse(req.body);
  let links = [];
  if (scope.link_id) links = [await access(req.user, scope.link_id, true)];
  else {
    if (
      !(
        await query('SELECT 1 FROM groups WHERE id=$1 AND coach_id=$2 AND NOT archived', [
          scope.group_id,
          req.user.id,
        ])
      ).rowCount
    )
      fail(404, 'Группа недоступна');
    links = (
      await query(
        "SELECT l.* FROM group_members gm JOIN links l ON l.id=gm.link_id WHERE gm.group_id=$1 AND l.status='active' AND NOT l.archived",
        [scope.group_id],
      )
    ).rows;
  }
  if (!links.length) fail(400, 'В группе нет активных участников');
  const tasks = await transaction(async (db) => {
    const result = [];
    for (const l of links) {
      const t = (
        await db.query(
          'INSERT INTO tasks(link_id,group_id,title,description,kind,due_at,location,exercises,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [
            l.id,
            scope.group_id || null,
            b.title,
            b.description,
            b.kind,
            b.due_at,
            b.location,
            JSON.stringify(
              b.exercises.map((e) => ({
                ...e,
                actor: 'т',
                sets: e.sets.map((s) => ({ ...s, actor: 'т' })),
              })),
            ),
            req.user.id,
          ],
        )
      ).rows[0];
      await audit(db, req.user, l.id, 'task', t.id, null, t);
      result.push(t);
    }
    return result;
  });
  for (const [i, t] of tasks.entries())
    await notify(
      links[i].trainee_id,
      'trainee',
      'task',
      `Новая задача: ${t.title}`,
      t.link_id,
      t.id,
    );
  res.status(201).json(tasks);
});
api.get('/tasks/:id', async (req, res) => {
  const t = (await query('SELECT * FROM tasks WHERE id=$1', [V.uuid.parse(req.params.id)])).rows[0];
  if (!t) fail(404, 'Задача не найдена');
  const l = await access(req.user, t.link_id);
  res.json({
    ...t,
    link: l,
    attachments: (
      await query(
        'SELECT id,task_id,exercise_id,set_id,filename,mime,size FROM attachments WHERE task_id=$1 ORDER BY created_at',
        [t.id],
      )
    ).rows,
    comments: (
      await query(
        'SELECT c.*,u.name AS author_name FROM important_comments c JOIN users u ON u.id=c.author_id WHERE task_id=$1 ORDER BY created_at',
        [t.id],
      )
    ).rows,
  });
});
api.put('/tasks/:id', async (req, res) => {
  const b = V.task.parse(req.body);
  const version = z.number().int().parse(req.body.version);
  res.json(
    await transaction(async (db) => {
      const t = (
        await db.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [V.uuid.parse(req.params.id)])
      ).rows[0];
      if (!t) fail(404, 'Задача не найдена');
      const l = await access(req.user, t.link_id, false, db);
      if (version !== t.version)
        fail(409, 'Задача изменена другим участником. Обновите её перед сохранением.');
      const actor = isCoach(req.user, l) ? 'т' : 'п';
      const incomingIds = new Set(b.exercises.map((e) => e.id));
      if (incomingIds.size !== b.exercises.length) fail(400, 'Повтор упражнения');
      for (const old of t.exercises)
        if (!incomingIds.has(old.id)) b.exercises.push({ ...old, deleted: true, actor });
      for (const [index, e] of b.exercises.entries()) {
        const old = t.exercises.find((o) => o.id === e.id);
        e.actor =
          JSON.stringify(old) !== JSON.stringify(e) || t.exercises[index]?.id !== e.id
            ? actor
            : old.actor;
        const setIds = new Set(e.sets.map((s) => s.id));
        if (setIds.size !== e.sets.length) fail(400, 'Повтор подхода');
        for (const [setIndex, s] of e.sets.entries()) {
          const prev = old?.sets.find((p) => p.id === s.id);
          s.actor =
            JSON.stringify(prev) !== JSON.stringify(s) || old?.sets[setIndex]?.id !== s.id
              ? actor
              : prev.actor;
        }
      }
      const updated = (
        await db.query(
          'UPDATE tasks SET title=$2,description=$3,kind=$4,due_at=$5,location=$6,status=$7,exercises=$8,version=version+1,updated_by=$9,updated_at=now() WHERE id=$1 RETURNING *',
          [
            t.id,
            b.title,
            b.description,
            b.kind,
            b.due_at,
            b.location,
            b.status,
            JSON.stringify(b.exercises),
            req.user.id,
          ],
        )
      ).rows[0];
      await audit(db, req.user, l.id, 'task', t.id, t, updated);
      return updated;
    }),
  );
});
api.post('/tasks/:id/comments', async (req, res) => {
  const body = z.string().trim().min(1).max(2000).parse(req.body.body);
  const t = (await query('SELECT * FROM tasks WHERE id=$1', [V.uuid.parse(req.params.id)])).rows[0];
  if (!t) fail(404, 'Задача не найдена');
  const l = await access(req.user, t.link_id);
  const c = (
    await query(
      'INSERT INTO important_comments(task_id,author_id,body) VALUES($1,$2,$3) RETURNING *',
      [t.id, req.user.id, body],
    )
  ).rows[0];
  if (!isCoach(req.user, l)) {
    const u = (await query('SELECT preferences FROM users WHERE id=$1', [l.coach_id])).rows[0];
    if (
      u.preferences.important !== 'off' &&
      (u.preferences.important !== 'in_person' || t.kind === 'in_person')
    )
      await notify(l.coach_id, 'coach', 'important', `${req.user.name}: ${body}`, l.id, t.id);
  }
  res.status(201).json(c);
});
const uploadDir = resolve('uploads');
mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 2 },
  fileFilter: (req, file, cb) =>
    cb(
      null,
      [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.mimetype),
    ),
});
api.post(
  '/tasks/:id/attachments',
  async (req, res, next) => {
    const t = (await query('SELECT * FROM tasks WHERE id=$1', [V.uuid.parse(req.params.id)]))
      .rows[0];
    if (!t) fail(404, 'Задача не найдена');
    await access(req.user, t.link_id);
    req.task = t;
    next();
  },
  upload.single('file'),
  async (req, res) => {
    if (!req.file) fail(400, 'Разрешены JPG, PNG, WebP, MP4, WebM, PDF и DOCX до 25 МБ');
    try {
      const bytes = await readFile(req.file.path);
      const hex = bytes.subarray(0, 12).toString('hex');
      const mime = req.file.mimetype;
      const valid =
        mime === 'image/jpeg'
          ? hex.startsWith('ffd8ff')
          : mime === 'image/png'
            ? hex.startsWith('89504e470d0a1a0a')
            : mime === 'image/webp'
              ? bytes.subarray(0, 4).toString() === 'RIFF' &&
                bytes.subarray(8, 12).toString() === 'WEBP'
              : mime === 'video/mp4'
                ? bytes.subarray(4, 8).toString() === 'ftyp'
                : mime === 'video/webm'
                  ? hex.startsWith('1a45dfa3')
                  : mime === 'application/pdf'
                    ? bytes.subarray(0, 5).toString() === '%PDF-'
                    : hex.startsWith('504b0304');
      if (!valid) fail(400, 'Содержимое файла не соответствует формату');
      const b = z
        .object({ exercise_id: V.uuid.optional(), set_id: V.uuid.optional() })
        .parse(req.body);
      const ex = req.task.exercises.find((e) => e.id === b.exercise_id);
      if (b.exercise_id && !ex) fail(400, 'Упражнение не найдено');
      if (b.set_id && !ex?.sets.some((s) => s.id === b.set_id)) fail(400, 'Подход не найден');
      if (
        !b.exercise_id &&
        (
          await query('SELECT 1 FROM attachments WHERE task_id=$1 AND exercise_id IS NULL', [
            req.task.id,
          ])
        ).rowCount
      )
        fail(400, 'К задаче можно прикрепить один файл; остальные — к упражнениям и подходам');
      res
        .status(201)
        .json(
          (
            await query(
              'INSERT INTO attachments(task_id,exercise_id,set_id,filename,storage_key,mime,size,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename,size',
              [
                req.task.id,
                b.exercise_id || null,
                b.set_id || null,
                Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255),
                req.file.filename,
                req.file.mimetype,
                req.file.size,
                req.user.id,
              ],
            )
          ).rows[0],
        );
    } catch (e) {
      await unlink(req.file.path);
      throw e;
    }
  },
);
api.delete('/tasks/:id/attachments', async (req, res) => {
  const files = await transaction(async (db) => {
    const task = (
      await db.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [V.uuid.parse(req.params.id)])
    ).rows[0];
    if (!task) fail(404, 'Тренировка не найдена');
    await access(req.user, task.link_id, false, db);
    return (
      await db.query('DELETE FROM attachments WHERE task_id=$1 RETURNING storage_key', [task.id])
    ).rows;
  });
  await Promise.all(files.map((f) => unlink(resolve(uploadDir, f.storage_key)).catch(() => {})));
  res.json({ deleted: files.length });
});
api.get('/attachments/:id', async (req, res) => {
  const f = (
    await query(
      'SELECT a.*,t.link_id FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1',
      [V.uuid.parse(req.params.id)],
    )
  ).rows[0];
  if (!f) fail(404, 'Файл не найден');
  await access(req.user, f.link_id);
  res.set({
    'Content-Type': f.mime,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    'Cache-Control': 'no-store',
  });
  createReadStream(resolve(uploadDir, f.storage_key))
    .on('error', () => res.destroy())
    .pipe(res);
});
api.delete('/attachments/:id', async (req, res) => {
  const f = (
    await query(
      'SELECT a.*,t.link_id FROM attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1',
      [V.uuid.parse(req.params.id)],
    )
  ).rows[0];
  if (!f) fail(404, 'Файл не найден');
  await access(req.user, f.link_id);
  await query('DELETE FROM attachments WHERE id=$1', [f.id]);
  await unlink(resolve(uploadDir, f.storage_key)).catch(() => {});
  res.json({ ok: true });
});
api.post('/cards/:id/reports', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id), true);
  const b = z
    .object({
      description: z.string().trim().min(1).max(2000),
      due_at: z.iso.datetime({ offset: true }),
    })
    .parse(req.body);
  const r = (
    await query(
      'INSERT INTO report_requests(link_id,description,due_at) VALUES($1,$2,$3) RETURNING *',
      [l.id, b.description, b.due_at],
    )
  ).rows[0];
  await notify(l.trainee_id, 'trainee', 'report', `Нужен отчёт: ${b.description}`, l.id);
  res.status(201).json(r);
});
api.put('/reports/:id', async (req, res) => {
  const r = (
    await query('SELECT * FROM report_requests WHERE id=$1', [V.uuid.parse(req.params.id)])
  ).rows[0];
  if (!r) fail(404, 'Отчёт не найден');
  await access(req.user, r.link_id);
  const response = z.string().trim().min(1).max(10000).parse(req.body.response);
  await query('UPDATE report_requests SET response=$2,submitted_at=now() WHERE id=$1', [
    r.id,
    response,
  ]);
  res.json({ ok: true });
});
api.get('/summaries', async (req, res) => {
  const mode = req.query.mode === 'trainee';
  const sums = (
    await query(
      `SELECT s.*,u.name FROM summaries s JOIN links l ON l.id=s.link_id JOIN users u ON u.id=l.trainee_id WHERE l.${mode ? 'trainee_id' : 'coach_id'}=$1 AND l.status='active' AND ($2 OR s.published) ORDER BY s.created_at DESC`,
      [req.user.id, !mode],
    )
  ).rows;
  if (mode) {
    for (let i = 0; i < sums.length; i++) {
      const l = await access(req.user, sums[i].link_id);
      sums[i] = redactSummary(
        sums[i],
        (await visibleMetrics(req.user, l)).map((m) => m.id),
      );
    }
  }
  res.json(sums);
});
api.post('/cards/:id/summaries', async (req, res) => {
  const l = await access(req.user, V.uuid.parse(req.params.id));
  const b = z
    .object({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }),
      metric_ids: z.array(V.uuid).default([]),
    })
    .refine((x) => new Date(x.end) > new Date(x.start), 'Конец периода должен быть позже начала')
    .parse(req.body);
  const s = await buildSummary(l.id, b.start, b.end, false, null, b.metric_ids);
  await notify(l.coach_id, 'coach', 'summary', 'Сводка ожидает проверки', l.id);
  res
    .status(201)
    .json(
      isCoach(req.user, l) ? s : { ok: true, message: 'Сводка отправлена тренеру на проверку' },
    );
});
api.put('/summaries/:id', async (req, res) => {
  const s = (await query('SELECT * FROM summaries WHERE id=$1', [V.uuid.parse(req.params.id)]))
    .rows[0];
  if (!s) fail(404, 'Сводка не найдена');
  const l = await access(req.user, s.link_id, true);
  const b = z
    .object({ personal_comment: z.string().max(5000), published: z.boolean() })
    .parse(req.body);
  await query('UPDATE summaries SET personal_comment=$2,published=$3 WHERE id=$1', [
    s.id,
    b.personal_comment,
    b.published,
  ]);
  if (b.published && !s.published)
    await notify(l.trainee_id, 'trainee', 'summary', 'Обратная связь от тренера готова', l.id);
  res.json({ ok: true });
});
api.get('/schedules', async (req, res) =>
  res.json(
    (
      await query('SELECT * FROM summary_schedules WHERE coach_id=$1 ORDER BY next_run', [
        req.user.id,
      ])
    ).rows,
  ),
);
api.post('/schedules', async (req, res) => {
  const b = z
    .object({
      link_id: V.uuid.nullable().default(null),
      group_id: V.uuid.nullable().default(null),
      frequency: z.enum(['week', 'fortnight', 'month', 'custom']),
      days: z.number().int().min(1).max(365).default(7),
      auto_send: z.boolean(),
      metric_ids: z.array(V.uuid).default([]),
    })
    .refine((x) => !(x.link_id && x.group_id))
    .parse(req.body);
  if (b.link_id) await access(req.user, b.link_id, true);
  if (
    b.group_id &&
    !(await query('SELECT 1 FROM groups WHERE id=$1 AND coach_id=$2', [b.group_id, req.user.id]))
      .rowCount
  )
    fail(404, 'Группа недоступна');
  res
    .status(201)
    .json(
      (
        await query(
          'INSERT INTO summary_schedules(coach_id,link_id,group_id,frequency,days,auto_send,metric_ids) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            req.user.id,
            b.link_id,
            b.group_id,
            b.frequency,
            b.days,
            b.auto_send,
            JSON.stringify(b.metric_ids),
          ],
        )
      ).rows[0],
    );
});
api.delete('/schedules/:id', async (req, res) => {
  await query('DELETE FROM summary_schedules WHERE id=$1 AND coach_id=$2', [
    V.uuid.parse(req.params.id),
    req.user.id,
  ]);
  res.json({ ok: true });
});
api.get('/notifications', async (req, res) =>
  res.json(
    (
      await query(
        "SELECT n.* FROM notifications n LEFT JOIN links l ON l.id=n.link_id WHERE n.user_id=$1 AND n.mode=$2 AND (n.link_id IS NULL OR (l.status='active' AND (l.coach_id=$1 OR l.trainee_id=$1))) ORDER BY n.created_at DESC LIMIT 100",
        [req.user.id, req.query.mode === 'trainee' ? 'trainee' : 'coach'],
      )
    ).rows,
  ),
);
api.post('/notifications/read', async (req, res) => {
  await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND mode=$2', [
    req.user.id,
    req.body.mode === 'trainee' ? 'trainee' : 'coach',
  ]);
  res.json({ ok: true });
});
