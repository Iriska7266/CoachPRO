import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { hashPassword } from './lib/security.js';
import { createCard } from './services.js';
export async function seed() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Демонстрационные данные запрещены в production');
  if ((await pool.query("SELECT 1 FROM users WHERE email='coach@coachpro.local'")).rowCount) return;
  const hash = await hashPassword('CoachPRO2026!');
  await transaction(async (db) => {
    const names = [
      'Александр Морозов',
      'Анна Смирнова',
      'Михаил Волков',
      'Мария Кузнецова',
      'Дмитрий Соколов',
      'Елена Новикова',
      'Сергей Орлов',
    ];
    const users = [];
    for (let i = 0; i < names.length; i++)
      users.push(
        (
          await db.query(
            'INSERT INTO users(public_id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING *',
            [
              `CP-DEMO000${i}`,
              names[i],
              i === 0
                ? 'coach@coachpro.local'
                : i === 1
                  ? 'trainee@coachpro.local'
                  : `demo${i}@coachpro.local`,
              hash,
            ],
          )
        ).rows[0],
      );
    const group = (
      await db.query(
        "INSERT INTO groups(coach_id,name,notes,schedule) VALUES($1,'Утренняя группа','Силовые тренировки и общая физическая подготовка','Пн, Ср, Пт · 09:00 · Зал № 2') RETURNING *",
        [users[0].id],
      )
    ).rows[0];
    for (let i = 1; i <= 5; i++) {
      const l = (
        await db.query('INSERT INTO links(coach_id,trainee_id) VALUES($1,$2) RETURNING *', [
          users[0].id,
          users[i].id,
        ])
      ).rows[0];
      await createCard(db, l.id);
      await db.query("UPDATE sections SET content=$2 WHERE link_id=$1 AND title='Цель'", [
        l.id,
        [
          '',
          'Улучшить выносливость и снизить вес',
          'Подготовиться к полумарафону',
          'Набрать мышечную массу',
          'Вернуться к регулярным тренировкам',
          'Укрепить спину и улучшить осанку',
        ][i],
      ]);
      await db.query("UPDATE sections SET content=$2 WHERE link_id=$1 AND title='Контакты'", [
        l.id,
        users[i].email,
      ]);
      await db.query(
        "UPDATE sections SET content='Нет отмеченных ограничений' WHERE link_id=$1 AND title='Ограничения'",
        [l.id],
      );
      await db.query(
        "UPDATE sections SET content='Личная заметка тренера: обсудить удобный график на следующей встрече.' WHERE link_id=$1 AND title='Заметки тренера'",
        [l.id],
      );
      const metric = (await db.query('SELECT * FROM metrics WHERE link_id=$1', [l.id])).rows[0];
      for (let n = 0; n < 8; n++) {
        const date = new Date();
        date.setDate(date.getDate() - (7 - n) * 3);
        date.setHours(9, 0, 0, 0);
        if (date > new Date()) date.setDate(date.getDate() - 1);
        const value =
          i === 1
            ? 78.5 - n * 0.32
            : i === 2
              ? 84 + n * 0.02
              : i === 3
                ? 62 - n * 0.15
                : 70 + i - n * 0.1;
        await db.query(
          'INSERT INTO entries(link_id,metric_id,value,measured_at,author_id,operation_id,elapsed_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            l.id,
            metric.id,
            Math.round(value * 10) / 10,
            date,
            users[0].id,
            randomUUID(),
            5000 + n * 310,
          ],
        );
      }
      if (i < 4) await db.query('INSERT INTO group_members VALUES($1,$2)', [group.id, l.id]);
      for (let j = 0; j < 3; j++) {
        const due = new Date();
        due.setDate(due.getDate() + j - 1);
        due.setHours(10 + i, 0, 0, 0);
        const ex = [
          {
            id: randomUUID(),
            title: 'Приседания с гантелями',
            parameters: 'Темп спокойный · отдых 90 сек',
            done: j === 0,
            deleted: false,
            comment: '',
            actor: 'т',
            sets: [1, 2, 3].map(() => ({
              id: randomUUID(),
              weight: '12',
              reps: '12',
              parameters: '',
              done: j === 0,
              actor: 'т',
            })),
          },
          {
            id: randomUUID(),
            title: 'Тяга верхнего блока',
            parameters: 'Следить за положением спины',
            done: j === 0,
            deleted: false,
            comment: '',
            actor: 'т',
            sets: [1, 2, 3].map(() => ({
              id: randomUUID(),
              weight: '25',
              reps: '10',
              parameters: '',
              done: j === 0,
              actor: 'т',
            })),
          },
        ];
        await db.query(
          'INSERT INTO tasks(link_id,title,kind,due_at,location,status,exercises,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            l.id,
            j === 1
              ? 'Силовая · всё тело'
              : j === 2
                ? 'Восстановление и мобильность'
                : 'Силовая · базовая',
            j === 2 ? 'online' : 'in_person',
            due,
            j === 2 ? '' : 'Зал № 2',
            j === 0 ? 'done' : 'todo',
            JSON.stringify(ex),
            users[0].id,
          ],
        );
      }
    }
    const own = (
      await db.query('INSERT INTO links(coach_id,trainee_id) VALUES($1,$2) RETURNING *', [
        users[6].id,
        users[0].id,
      ])
    ).rows[0];
    await createCard(db, own.id);
    await db.query(
      "UPDATE sections SET content='Техника плавания' WHERE link_id=$1 AND title='Цель'",
      [own.id],
    );
    const template = [
      {
        id: randomUUID(),
        title: 'Приседания',
        parameters: 'Разминка перед первым подходом',
        done: false,
        deleted: false,
        comment: '',
        sets: [1, 2, 3].map(() => ({
          id: randomUUID(),
          weight: '20',
          reps: '10',
          parameters: '',
          done: false,
        })),
      },
    ];
    await db.query(
      "INSERT INTO templates(owner_id,name,kind,data) VALUES($1,'Базовая силовая','task',$2)",
      [users[0].id, JSON.stringify(template)],
    );
  });
  console.log('Созданы демонстрационные аккаунты. Данные вымышленные.');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
  await pool.end();
}
