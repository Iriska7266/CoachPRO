CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_id text UNIQUE NOT NULL,
 name text NOT NULL, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 preferences jsonb NOT NULL DEFAULT '{"reminderTime":"09:00","timezone":"Asia/Yekaterinburg","important":"all","disabled":[]}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets (token_hash text PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid REFERENCES users(id) NOT NULL,
 name text NOT NULL, notes text NOT NULL DEFAULT '', schedule text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid REFERENCES users(id) NOT NULL, trainee_id uuid REFERENCES users(id) NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','left')), archived boolean NOT NULL DEFAULT false,
 manual_trend text CHECK(manual_trend IN ('up','flat','down')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(coach_id,trainee_id), CHECK(coach_id<>trainee_id)
);
CREATE TABLE IF NOT EXISTS group_members (group_id uuid REFERENCES groups(id) ON DELETE CASCADE, link_id uuid REFERENCES links(id) ON DELETE CASCADE, PRIMARY KEY(group_id,link_id));
CREATE TABLE IF NOT EXISTS invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid REFERENCES users(id) NOT NULL, target_id uuid REFERENCES users(id),
 group_id uuid REFERENCES groups(id), token_hash text UNIQUE NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) ON DELETE CASCADE NOT NULL,
 title text NOT NULL, content text NOT NULL DEFAULT '', visible boolean NOT NULL DEFAULT true, editable boolean NOT NULL DEFAULT true,
 position integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) ON DELETE CASCADE NOT NULL, section_id uuid REFERENCES sections(id),
 name text NOT NULL, unit text NOT NULL DEFAULT '', direction text NOT NULL DEFAULT 'up' CHECK(direction IN ('up','down','target')),
 target double precision, threshold double precision NOT NULL DEFAULT 1 CHECK(threshold>=0), owner text NOT NULL DEFAULT 'shared' CHECK(owner IN ('trainer','shared','system')),
 current_value double precision, CHECK(direction<>'target' OR target IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) NOT NULL, group_id uuid REFERENCES groups(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', kind text NOT NULL CHECK(kind IN ('online','in_person')),
 due_at timestamptz NOT NULL, location text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
 exercises jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, updated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) NOT NULL, metric_id uuid REFERENCES metrics(id) NOT NULL,
 task_id uuid REFERENCES tasks(id), value double precision NOT NULL, measured_at timestamptz NOT NULL DEFAULT now(),
 author_id uuid REFERENCES users(id) NOT NULL, operation_id uuid NOT NULL, elapsed_ms integer CHECK(elapsed_ms>=0), note text NOT NULL DEFAULT '',
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(author_id,operation_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) NOT NULL, actor_id uuid REFERENCES users(id) NOT NULL,
 entity_type text NOT NULL, entity_id uuid NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES users(id) NOT NULL, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('task','card')), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid REFERENCES tasks(id) NOT NULL, exercise_id text, set_id text,
 filename text NOT NULL, storage_key text NOT NULL, mime text NOT NULL, size integer NOT NULL, author_id uuid REFERENCES users(id) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS important_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid REFERENCES tasks(id) NOT NULL, author_id uuid REFERENCES users(id) NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS report_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) NOT NULL, description text NOT NULL, due_at timestamptz NOT NULL,
 response text, submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS summary_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coach_id uuid REFERENCES users(id) NOT NULL, link_id uuid REFERENCES links(id), group_id uuid REFERENCES groups(id),
 frequency text NOT NULL DEFAULT 'week' CHECK(frequency IN ('week','fortnight','month','custom')), days integer NOT NULL DEFAULT 7 CHECK(days BETWEEN 1 AND 365),
 auto_send boolean NOT NULL DEFAULT false, next_run timestamptz NOT NULL DEFAULT now(), metric_ids jsonb NOT NULL DEFAULT '[]', CHECK(link_id IS NULL OR group_id IS NULL)
);
CREATE TABLE IF NOT EXISTS summaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid REFERENCES links(id) NOT NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, data jsonb NOT NULL, automatic_text text NOT NULL,
 personal_comment text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT false, schedule_key text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) NOT NULL, mode text NOT NULL CHECK(mode IN ('coach','trainee')),
 type text NOT NULL, body text NOT NULL, link_id uuid REFERENCES links(id), task_id uuid REFERENCES tasks(id), read_at timestamptz, dedupe_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) NOT NULL, subscription jsonb NOT NULL, UNIQUE(user_id,subscription));
CREATE INDEX IF NOT EXISTS entries_link_date ON entries(link_id,measured_at DESC);
CREATE INDEX IF NOT EXISTS tasks_link_due ON tasks(link_id,due_at);
CREATE INDEX IF NOT EXISTS audit_link_date ON audit_events(link_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_date ON notifications(user_id,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS one_task_attachment ON attachments(task_id) WHERE exercise_id IS NULL;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE metrics ADD COLUMN IF NOT EXISTS target_date text;
