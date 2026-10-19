import { z } from 'zod';
export const uuid = z.string().uuid();
const text = (max = 200) => z.string().trim().min(1).max(max);
export const auth = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const register = auth.extend({ name: text(100) });
export const group = z.object({
  name: text(100),
  notes: z.string().max(3000).default(''),
  schedule: z.string().max(1000).default(''),
  archived: z.boolean().default(false),
});
export const section = z.object({
  title: text(100),
  content: z.string().max(5000).default(''),
  visible: z.boolean().default(true),
  editable: z.boolean().default(true),
});
export const metric = z
  .object({
    name: text(100),
    unit: z.string().max(30).default(''),
    section_id: uuid.nullable().optional(),
    direction: z.enum(['up', 'down', 'target']).default('up'),
    target: z.number().finite().nullable().default(null),
    target_date: z.iso.date().nullable().default(null),
    threshold: z.number().min(0).max(100).default(1),
    owner: z.enum(['trainer', 'shared', 'system']).default('shared'),
    current_value: z.number().finite().nullable().default(null),
  })
  .refine((m) => !m.target_date || m.target !== null, 'Для плана по дате укажите целевое значение')
  .refine((m) => m.direction !== 'target' || m.target !== null, 'Укажите целевое значение');
export const entry = z.object({
  metric_id: uuid,
  task_id: uuid.nullable().default(null),
  value: z.number().finite(),
  measured_at: z.iso.datetime({ offset: true }),
  operation_id: uuid,
  elapsed_ms: z.number().int().min(0).max(86400000).nullable().default(null),
  note: z.string().max(2000).default(''),
});
const set = z.object({
  id: uuid,
  weight: z.string().max(50).default(''),
  reps: z.string().max(50).default(''),
  parameters: z.string().max(300).default(''),
  done: z.boolean().default(false),
  actor: z.enum(['т', 'п']).optional(),
});
const exercise = z.object({
  id: uuid,
  title: text(200),
  sets: z.array(set).max(100).default([]),
  done: z.boolean().default(false),
  deleted: z.boolean().default(false),
  comment: z.string().max(2000).default(''),
  parameters: z.string().max(1000).default(''),
  template_id: uuid.optional(),
  template_name: z.string().max(100).optional(),
  actor: z.enum(['т', 'п']).optional(),
});
export const task = z.object({
  title: text(200),
  description: z.string().max(5000).default(''),
  kind: z.enum(['online', 'in_person']),
  due_at: z.iso.datetime({ offset: true }),
  location: z.string().max(300).default(''),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  exercises: z.array(exercise).max(100).default([]),
});
export const preferences = z.object({
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z
    .string()
    .max(80)
    .refine((t) => {
      try {
        Intl.DateTimeFormat('en', { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }),
  important: z.enum(['all', 'in_person', 'off']),
  disabled: z.array(z.enum(['task', 'report', 'summary', 'reminder', 'important'])).max(5),
});
