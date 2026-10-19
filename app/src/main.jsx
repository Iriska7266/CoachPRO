import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  BarChart3,
  Settings,
  Bell,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Zap,
  Clock,
  Check,
  MoreHorizontal,
  Link as LinkIcon,
  Copy,
  Archive,
  UserRound,
  Layers,
  WifiOff,
  RefreshCw,
  ArrowRight,
  FileText,
  TrendingUp,
  Activity,
  SlidersHorizontal,
  CheckCircle2,
  Menu,
  Download,
  Paperclip,
  Trash2,
  ArrowUp,
  ArrowDown,
  QrCode,
  ScanLine,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { api, cacheGet, cachePut, enqueue, queued, flush } from './api.js';
import {
  Avatar,
  Trend,
  Status,
  Empty,
  Modal,
  Form,
  Field,
  Chart,
  Counter,
  date,
  dt,
} from './ui.jsx';
import './styles.css';
const today = () => new Date().toLocaleDateString('en-CA');
const newExercise = () => ({
  id: crypto.randomUUID(),
  title: 'Новое упражнение',
  parameters: '',
  comment: '',
  done: false,
  deleted: false,
  sets: [{ id: crypto.randomUUID(), weight: '', reps: '', parameters: '', done: false }],
});
const labels = {
  dashboard: 'Обзор',
  people: 'Подопечные',
  groups: 'Группы',
  tasks: 'Тренировки',
  summaries: 'Сводки',
  templates: 'Шаблоны',
  settings: 'Настройки',
  card: 'Карточка подопечного',
  notifications: 'Уведомления',
};
function Auth({ setUser, invite }) {
  const [tab, setTab] = useState(
      new URLSearchParams(location.search).has('reset') ? 'reset' : 'login',
    ),
    [message, setMessage] = useState('');
  return (
    <main className="auth">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">ПРОСТРАНСТВО ТРЕНЕРА</span>
          <h1>
            Больше внимания
            <br />
            людям.
            <br />
            <em>Меньше рутины.</em>
          </h1>
          <p>
            Подопечные, тренировки и прогресс.
            <br />
            Всё, что нужно для вашей работы, в одном месте.
          </p>
          <div className="auth-graphic">
            <div>
              <Activity size={30} />
              <span>Движение к цели</span>
              <b>Каждый результат имеет значение</b>
            </div>
            <svg viewBox="0 0 400 100">
              <path
                d="M0 90 Q50 75 80 80 T160 50 T240 45 T320 20 T400 5"
                stroke="#b9efca"
                strokeWidth="4"
                fill="none"
              />
            </svg>
          </div>
        </div>
        <small>CoachPRO · Веб-версия</small>
      </section>
      <section className="auth-form">
        <div className="auth-box">
          <span className="eyebrow">РАДЫ ВАС ВИДЕТЬ</span>
          <h2>
            {tab === 'login'
              ? 'С возвращением'
              : tab === 'register'
                ? 'Создайте аккаунт'
                : tab === 'forgot'
                  ? 'Восстановить доступ'
                  : 'Новый пароль'}
          </h2>
          <p>
            {invite
              ? `Вас приглашает ${invite.coach_name}${invite.group_name ? ` в группу «${invite.group_name}»` : ''}. После входа подтвердите приглашение.`
              : 'Один аккаунт, чтобы тренировать и тренироваться.'}
          </p>
          <Form
            submit={
              tab === 'login'
                ? 'Войти в CoachPRO'
                : tab === 'register'
                  ? 'Создать аккаунт'
                  : tab === 'forgot'
                    ? 'Получить инструкцию'
                    : 'Сохранить пароль'
            }
            onSubmit={async (b) => {
              if (tab === 'forgot') {
                const r = await api('/auth/forgot', b);
                setMessage(r.message);
                return;
              }
              if (tab === 'reset') {
                await api('/auth/reset', {
                  ...b,
                  token: new URLSearchParams(location.search).get('reset'),
                });
                setMessage('Пароль изменён. Войдите в аккаунт.');
                history.replaceState(null, '', '/');
                setTab('login');
                return;
              }
              const u = await api(`/auth/${tab}`, b);
              setUser(u);
            }}
          >
            {tab === 'register' && (
              <Field label="Имя и фамилия" name="name" required autoComplete="name" />
            )}
            {tab !== 'reset' && (
              <Field
                label="Электронная почта"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            )}
            {tab !== 'forgot' && (
              <Field
                label="Пароль · не менее 10 символов"
                type="password"
                name="password"
                required
                minLength="10"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
            )}
          </Form>
          {message && <p className="success-note">{message}</p>}
          <div className="auth-links">
            <button
              onClick={() => {
                setMessage('');
                setTab(tab === 'register' ? 'login' : 'register');
              }}
            >
              {tab === 'register' ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}
            </button>
            <button onClick={() => setTab('forgot')}>Забыли пароль?</button>
          </div>
          {import.meta.env.DEV && (
            <div className="demo-box">
              <b>Посмотреть на примере</b>
              <p>Вымышленные подопечные и результаты</p>
              <button
                className="btn secondary"
                onClick={async () => {
                  try {
                    setUser(
                      await api('/auth/login', {
                        email: 'coach@coachpro.local',
                        password: 'CoachPRO2026!',
                      }),
                    );
                  } catch (e) {
                    setMessage(e.message);
                  }
                }}
              >
                Открыть демо тренера <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Activity size={23} />
      </span>
      <span>
        Coach<span className="brand-pro">PRO</span>
      </span>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState(localStorage.getItem('coachpro-mode') || 'coach'),
    [page, setPage] = useState('dashboard'),
    [data, setData] = useState({
      links: [],
      groups: [],
      tasks: [],
      summaries: [],
      notifications: [],
      templates: [],
    }),
    [selected, setSelected] = useState(null),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [pending, setPending] = useState(0),
    [invite, setInvite] = useState(null),
    [mobile, setMobile] = useState(false);
  const notify = useCallback((message) => {
    setToast(message);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    api('/me')
      .then(setUser)
      .catch(async (e) => {
        if (!e.status) {
          const id = localStorage.getItem('coachpro-user');
          if (id) setUser(await cacheGet(`user:${id}`));
        }
      })
      .finally(() => setReady(true));
    const token = new URLSearchParams(location.search).get('invite');
    if (token)
      api(`/invitation/${token}`)
        .then(setInvite)
        .catch((e) => setError(e.message));
  }, []);
  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [links, groups, tasks, summaries, notifications, templates] = await Promise.all([
        api(`/links?mode=${mode}`),
        api('/groups'),
        api(`/tasks?mode=${mode}`),
        api(`/summaries?mode=${mode}`),
        api(`/notifications?mode=${mode}`),
        api('/templates'),
      ]);
      const next = { links, groups, tasks, summaries, notifications, templates };
      setData(next);
      setOffline(false);
      await cachePut(`${user.id}:${mode}`, next);
      setError('');
    } catch (e) {
      if (!e.status) {
        const saved = await cacheGet(`${user.id}:${mode}`);
        if (saved) setData(saved);
        setOffline(true);
      } else if (e.status === 401) {
        setUser(null);
      } else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, mode]);
  useEffect(() => {
    if (user) {
      localStorage.setItem('coachpro-user', user.id);
      cachePut(`user:${user.id}`, user);
      reload();
      queued(user.id).then((q) => setPending(q.length));
    }
  }, [user?.id, mode, reload]);
  useEffect(() => {
    const online = async () => {
      setOffline(false);
      if (user) {
        const r = await flush(user.id);
        setPending((await queued(user.id)).length);
        if (r.error) setError(`Очередь не отправлена: ${r.error}`);
        if (r.sent) notify(`Отправлено записей: ${r.sent}`);
        reload();
      }
    };
    const off = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    if (user && navigator.onLine) online();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', off);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      if (navigator.onLine)
        api(`/notifications?mode=${mode}`)
          .then((notifications) => setData((d) => ({ ...d, notifications })))
          .catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [user?.id, mode]);
  const go = (p, id) => {
    setPage(p);
    setSelected(id || null);
    setMobile(false);
  };
  const done = async (message = 'Сохранено') => {
    setModal(null);
    notify(message);
    await reload();
  };
  const openCard = (id) => go('card', id);
  const quick = (id) =>
    setModal({ type: 'quick', id: id || data.links.find((l) => !l.archived)?.id });
  const openTask = (id) => setModal({ type: 'task-detail', id });
  if (!ready)
    return (
      <div className="splash">
        <Brand />
        <p>Открываем ваше пространство…</p>
      </div>
    );
  if (!user) return <Auth setUser={setUser} invite={invite} />;
  const active = data.links.filter((l) => !l.archived),
    unread = data.notifications.filter((n) => !n.read_at).length;
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Brand />
        <button
          className="mode-switch"
          onClick={() => {
            const next = mode === 'coach' ? 'trainee' : 'coach';
            setMode(next);
            localStorage.setItem('coachpro-mode', next);
            go('dashboard');
          }}
        >
          <span className="mode-icon">
            <UserRound size={18} />
          </span>
          <span>
            <small>Ваше пространство</small>
            <b>{mode === 'coach' ? 'Я тренер' : 'Я подопечный'}</b>
          </span>
          <RefreshCw size={15} />
        </button>
        <span className="nav-label">РАБОЧИЙ СТОЛ</span>
        <nav>
          {[
            ['dashboard', LayoutDashboard],
            ['people', Users],
            ...(mode === 'coach' ? [['groups', Layers]] : []),
            ['tasks', CalendarDays],
            ['summaries', BarChart3],
            ...(mode === 'coach' ? [['templates', FileText]] : []),
          ].map(([key, Icon]) => (
            <button
              key={key}
              className={page === key || (page === 'card' && key === 'people') ? 'active' : ''}
              onClick={() => go(key)}
            >
              <Icon size={19} />
              <span>{key === 'people' && mode === 'trainee' ? 'Мои тренеры' : labels[key]}</span>
              {key === 'people' && <small>{active.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-dot" /> Всё начинается с внимания
            <p>
              Каждая запись — шаг
              <br />к результату.
            </p>
          </div>
          <button
            className={`nav-settings ${page === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings size={19} />
            Настройки
          </button>
          <div className="user-block">
            <Avatar name={user.name} />
            <span>
              <b>{user.name}</b>
              <small>{mode === 'coach' ? 'Тренер' : 'Подопечный'}</small>
            </span>
            <button
              aria-label="Выйти"
              className="icon-btn"
              onClick={async () => {
                try {
                  await api('/auth/logout', {});
                  localStorage.removeItem('coachpro-user');
                  setUser(null);
                  setData({
                    links: [],
                    groups: [],
                    tasks: [],
                    summaries: [],
                    notifications: [],
                    templates: [],
                  });
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-toggle"
              onClick={() => setMobile(!mobile)}
              aria-label="Открыть меню"
            >
              <Menu />
            </button>
            <span>Моё пространство</span>
            <ChevronRight size={14} />
            <b>{labels[page]}</b>
          </div>
          <div className="top-actions">
            {user.email.endsWith('@coachpro.local') && (
              <span className="demo-chip">Демо-данные</span>
            )}
            <span className="today">
              {date(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button
              className="notification-btn icon-btn"
              onClick={() => go('notifications')}
              aria-label={`Уведомления: ${unread} непрочитанных`}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <Avatar name={user.name} size="small" />
          </div>
        </header>
        <main className="content">
          {(offline || pending > 0) && (
            <div className="offline-banner">
              <WifiOff size={16} />
              {offline
                ? 'Нет сети. Быстрые записи сохраняются на этом устройстве.'
                : `В очереди: ${pending}. Отправим с вашего аккаунта.`}
              {!offline && (
                <button
                  onClick={async () => {
                    const r = await flush(user.id);
                    setPending((await queued(user.id)).length);
                    r.error ? setError(r.error) : notify(`Отправлено: ${r.sent}`);
                    reload();
                  }}
                >
                  Отправить
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={reload}>Повторить</button>
            </div>
          )}
          {invite && (
            <div className="invite-banner">
              <span>
                <b>{invite.coach_name}</b> приглашает вас{' '}
                {invite.group_name ? `в группу «${invite.group_name}»` : 'стать подопечным'}
              </span>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await api('/invitations/respond', {
                      token: new URLSearchParams(location.search).get('invite'),
                      accept: true,
                    });
                    setInvite(null);
                    history.replaceState(null, '', '/');
                    setMode('trainee');
                    done('Приглашение принято');
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                Принять
              </button>
              <button
                className="btn secondary"
                onClick={async () => {
                  await api('/invitations/respond', {
                    token: new URLSearchParams(location.search).get('invite'),
                    accept: false,
                  });
                  setInvite(null);
                  history.replaceState(null, '', '/');
                }}
              >
                Отклонить
              </button>
            </div>
          )}
          {page === 'dashboard' && (
            <Dashboard {...{ user, mode, data, go, quick, openCard, openTask, setModal }} />
          )}
          {page === 'people' && <People {...{ data, mode, openCard, quick, setModal }} />}
          {page === 'groups' && <Groups {...{ data, setModal, openCard, done }} />}
          {page === 'tasks' && <Tasks {...{ data, mode, openTask, setModal }} />}
          {page === 'card' && (
            <Card
              key={selected}
              revision={data}
              id={selected}
              {...{ user, mode, openTask, setModal, quick, notify, reload }}
              back={() => go('people')}
            />
          )}
          {page === 'summaries' && <Summaries {...{ data, mode, setModal, done }} />}
          {page === 'templates' && <Templates {...{ data, setModal, done }} />}
          {page === 'settings' && <SettingsPage {...{ user, setUser, notify, setModal }} />}
          {page === 'notifications' && (
            <Notifications {...{ data, mode, openCard, openTask, reload, notify }} />
          )}
          <footer className="page-footer">
            <span>CoachPRO</span>
            <span>Внимание к людям. Опора на данные.</span>
            {loading && <span>Обновляем…</span>}
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modals
          key={`${modal.type}:${modal.id || ''}`}
          {...{ modal, user, mode, data, setModal, done, notify, reload, setPending }}
        />
      )}
    </div>
  );
}
function Heading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Dashboard({ user, mode, data, go, quick, openCard, openTask, setModal }) {
  const active = data.links.filter((l) => !l.archived),
    due = data.tasks.filter((t) => new Date(t.due_at).toDateString() === new Date().toDateString()),
    overdue = data.tasks.filter((t) => t.status !== 'done' && new Date(t.due_at) < new Date()),
    growing = active.filter((l) => l.trend === 'up');
  return (
    <>
      <Heading
        eyebrow="ВАШ РАБОЧИЙ ДЕНЬ"
        title={`Здравствуйте, ${user.name.split(' ')[0]}`}
        description={
          mode === 'coach'
            ? 'Всё важное о ваших подопечных — перед вами.'
            : 'Ваши тренировки, результаты и следующий шаг.'
        }
      >
        <button className="btn secondary" disabled={!active.length} onClick={() => quick()}>
          <Zap size={17} />
          Быстрая запись
        </button>
        {mode === 'coach' && (
          <button className="btn primary" onClick={() => setModal({ type: 'invite' })}>
            <Plus size={18} />
            Добавить подопечного
          </button>
        )}
      </Heading>
      <div className="stats-grid">
        {[
          [
            mode === 'coach' ? 'Активных подопечных' : 'Моих тренеров',
            active.length,
            Users,
            'Всё в одном месте',
            'people',
          ],
          [
            'Тренировок сегодня',
            due.length,
            CalendarDays,
            `${due.filter((t) => t.status === 'done').length} уже выполнено`,
            'tasks',
          ],
          ['Результат растёт', growing.length, TrendingUp, 'По данным измерений', 'people'],
          ['Требуют внимания', overdue.length, Clock, 'Просроченные задачи', 'tasks'],
        ].map(([title, n, Icon, sub, page], i) => (
          <button className={`stat-card stat-${i}`} onClick={() => go(page)} key={title}>
            <div>
              <span>{title}</span>
              <Icon size={18} />
            </div>
            <b>{n.toString().padStart(2, '0')}</b>
            <small>
              {i === 2 && <span className="tiny-dot" />}
              {sub}
              <ArrowUpRight size={15} />
            </small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>
                  {mode === 'coach' ? 'Подопечные' : 'Мои тренеры'} <small>{active.length}</small>
                </h2>
                <p>Прогресс складывается из небольших шагов</p>
              </div>
              <button className="text-btn" onClick={() => go('people')}>
                Все <ArrowRight size={15} />
              </button>
            </div>
            <PeopleTable links={active.slice(0, 5)} {...{ mode, openCard, quick }} />
            {!active.length && (
              <Empty
                title="Начните с первого подопечного"
                text="Отправьте приглашение по ссылке или ID."
                action={
                  <button className="btn primary" onClick={() => setModal({ type: 'invite' })}>
                    Пригласить
                  </button>
                }
              />
            )}
          </section>
          <section className="focus-card">
            <div className="focus-symbol">
              <Zap size={27} />
            </div>
            <div>
              <span className="eyebrow">ПРОЩЕ, ЧЕМ В БЛОКНОТЕ</span>
              <h3>Результат за несколько секунд</h3>
              <p>Прошлое значение уже подставлено. Остаётся сохранить.</p>
            </div>
            <button className="btn secondary" disabled={!active.length} onClick={() => quick()}>
              Записать <ArrowUpRight size={16} />
            </button>
          </section>
        </div>
        <aside className="dashboard-side">
          <section className="panel schedule-panel">
            <div className="panel-head">
              <h2>
                Сегодня <span className="day-badge">{new Date().getDate()}</span>
              </h2>
              <button className="icon-btn" aria-label="Все тренировки" onClick={() => go('tasks')}>
                <ArrowUpRight size={19} />
              </button>
            </div>
            <div className="week-strip">
              {[-3, -2, -1, 0, 1, 2, 3].map((n) => {
                const d = new Date();
                d.setDate(d.getDate() + n);
                return (
                  <div className={n === 0 ? 'current' : ''} key={n}>
                    <small>{date(d, { weekday: 'short' })}</small>
                    <b>{d.getDate()}</b>
                    <i />
                  </div>
                );
              })}
            </div>
            <div className="schedule-list">
              {due.length ? (
                due.slice(0, 5).map((t) => (
                  <button className="schedule-item" key={t.id} onClick={() => openTask(t.id)}>
                    <span className="schedule-time">
                      {date(t.due_at, { hour: '2-digit', minute: '2-digit' })}
                      <i />
                    </span>
                    <span>
                      <small>{t.kind === 'in_person' ? 'ОЧНО' : 'ОНЛАЙН'}</small>
                      <b>{t.title}</b>
                      <span>{t.name}</span>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))
              ) : (
                <Empty title="Свободный день" text="Время для планирования следующего шага." />
              )}
            </div>
            <button className="schedule-all" onClick={() => go('tasks')}>
              Открыть все тренировки <ArrowRight size={16} />
            </button>
          </section>
          <section className="attention-card">
            <div>
              <span className="attention-icon">
                <Activity size={18} />
              </span>
              <h3>Держите руку на пульсе</h3>
            </div>
            <p>
              {overdue.length
                ? `${overdue.length} задач ожидают завершения. Возможно, подопечным нужна ваша поддержка.`
                : 'Просроченных задач нет. Можно сосредоточиться на следующей тренировке.'}
            </p>
            <button onClick={() => go('tasks')}>
              Посмотреть задачи <ArrowUpRight size={16} />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
function PeopleTable({ links, mode, openCard, quick }) {
  return (
    <div className="table-scroll">
      <table className="people-table">
        <thead>
          <tr>
            <th>{mode === 'coach' ? 'Подопечный' : 'Тренер / моя цель'}</th>
            <th>Динамика</th>
            <th>Последняя запись</th>
            <th aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {links.map((l) => (
            <tr key={l.id}>
              <td>
                <button className="person-cell" onClick={() => openCard(l.id)}>
                  <Avatar name={mode === 'coach' ? l.name : l.coach_name} />
                  <span>
                    <b>{mode === 'coach' ? l.name : l.coach_name}</b>
                    <small>{l.goal}</small>
                  </span>
                </button>
              </td>
              <td>
                <Trend value={l.trend} />
              </td>
              <td className="muted">{l.last_entry ? date(l.last_entry) : 'Нет записей'}</td>
              <td>
                <button
                  className="icon-btn quick-icon"
                  title="Быстрая запись"
                  onClick={() => quick(l.id)}
                >
                  <Plus size={19} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => openCard(l.id)}
                  aria-label={`Открыть ${l.name}`}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function People({ data, mode, openCard, quick, setModal }) {
  const [search, setSearch] = useState(''),
    [archive, setArchive] = useState(false),
    [group, setGroup] = useState('');
  const links = data.links.filter(
    (l) =>
      l.archived === archive &&
      `${l.name} ${l.coach_name} ${l.goal}`.toLowerCase().includes(search.toLowerCase()) &&
      (!group || l.group_ids.includes(group)),
  );
  return (
    <>
      <Heading
        eyebrow="ЛЮДИ И РЕЗУЛЬТАТЫ"
        title={mode === 'coach' ? 'Мои подопечные' : 'Мои тренеры'}
        description="Карточки, история и прогресс в одном месте."
      >
        {mode === 'coach' && (
          <button className="btn primary" onClick={() => setModal({ type: 'invite' })}>
            <Plus size={18} />
            Добавить подопечного
          </button>
        )}
      </Heading>
      <div className="toolbar">
        <div className="tabs">
          <button className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>
            Активные
          </button>
          <button className={archive ? 'active' : ''} onClick={() => setArchive(true)}>
            Архив
          </button>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Найти подопечного"
            placeholder="Поиск по имени или цели"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {mode === 'coach' && (
          <select
            aria-label="Фильтр группы"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">Все группы</option>
            {data.groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <section className="panel">
        <PeopleTable {...{ links, mode, openCard, quick }} />
        {!links.length && (
          <Empty title="Никого не нашли" text="Измените фильтры или добавьте подопечного." />
        )}
      </section>
    </>
  );
}
function Groups({ data, setModal, openCard, done }) {
  const [archive, setArchive] = useState(false);
  return (
    <>
      <Heading
        eyebrow="ВМЕСТЕ К ЦЕЛИ"
        title="Группы"
        description="Общее расписание. Индивидуальные результаты."
      >
        <button className="btn primary" onClick={() => setModal({ type: 'group' })}>
          <Plus size={18} />
          Создать группу
        </button>
      </Heading>
      <div className="tabs spaced">
        <button className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>
          Активные
        </button>
        <button className={archive ? 'active' : ''} onClick={() => setArchive(true)}>
          Архив
        </button>
      </div>
      <div className="group-grid">
        {data.groups
          .filter((g) => g.archived === archive)
          .map((g) => (
            <section className="panel group-card" key={g.id}>
              <div className="group-card-head">
                <span className="group-icon">
                  <Users />
                </span>
                <button
                  className="icon-btn"
                  onClick={() => setModal({ type: 'group', group: g })}
                  aria-label="Настроить группу"
                >
                  <Settings size={18} />
                </button>
              </div>
              <h2>{g.name}</h2>
              <p>{g.schedule || 'Расписание пока не указано'}</p>
              <p className="group-note">{g.notes || 'Добавьте общие заметки'}</p>
              <h4>Участники · {g.members.length}</h4>
              {g.members.map((m) => (
                <button className="group-member" key={m.id} onClick={() => openCard(m.id)}>
                  <Avatar name={m.name} size="small" />
                  {m.name}
                  <ChevronRight size={15} />
                </button>
              ))}
              <div className="group-actions">
                <button
                  className="btn secondary"
                  onClick={() => setModal({ type: 'group-members', group: g })}
                >
                  Участники
                </button>
                <button
                  className="btn primary"
                  disabled={g.archived || !g.members.length}
                  onClick={() => setModal({ type: 'new-task', group_id: g.id })}
                >
                  Тренировка
                </button>
              </div>
            </section>
          ))}
      </div>
      {!data.groups.filter((g) => g.archived === archive).length && (
        <Empty title="Групп пока нет" text="Создайте группу, чтобы назначать общие тренировки." />
      )}
    </>
  );
}
function Tasks({ data, mode, openTask, setModal }) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  const tasks = data.tasks.filter(
    (t) =>
      (filter === 'all' ||
        (filter === 'done' && t.status === 'done') ||
        (filter === 'pending' && t.status !== 'done') ||
        (filter === 'overdue' && t.status !== 'done' && new Date(t.due_at) < new Date())) &&
      `${t.title} ${t.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="ПЛАН И ПРАКТИКА"
        title="Тренировки"
        description="От первого подхода до готового отчёта."
      >
        {mode === 'coach' && (
          <button
            className="btn primary"
            disabled={!data.links.length}
            onClick={() => setModal({ type: 'new-task' })}
          >
            <Plus size={18} />
            Создать тренировку
          </button>
        )}
      </Heading>
      <div className="toolbar">
        <div className="tabs">
          {[
            ['all', 'Все'],
            ['pending', 'Предстоящие'],
            ['overdue', 'Просроченные'],
            ['done', 'Выполненные'],
          ].map(([v, l]) => (
            <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Найти тренировку"
            aria-label="Поиск тренировок"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <section className="panel task-list">
        {tasks.map((t) => (
          <button className="task-row" key={t.id} onClick={() => openTask(t.id)}>
            <div className="task-date">
              <b>{new Date(t.due_at).getDate()}</b>
              <small>{date(t.due_at, { month: 'short' })}</small>
            </div>
            <div className="task-info">
              <span className="eyebrow">
                {t.kind === 'in_person' ? 'ОЧНО' : 'ОНЛАЙН'} ·{' '}
                {date(t.due_at, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <b>{t.title}</b>
              <small>
                {t.name}
                {t.location ? ` · ${t.location}` : ''}
              </small>
            </div>
            <span className="task-progress">
              {t.exercises.filter((e) => e.done && !e.deleted).length}/
              {t.exercises.filter((e) => !e.deleted).length} упражнений
            </span>
            <Status task={t} />
            <ChevronRight size={18} />
          </button>
        ))}
        {!tasks.length && (
          <Empty
            title="Здесь пока нет тренировок"
            text="Создайте тренировку или измените фильтр."
          />
        )}
      </section>
    </>
  );
}
function Card({ id, revision, user, mode, openTask, setModal, quick, notify, reload, back }) {
  const [d, setD] = useState(null),
    [err, setErr] = useState(''),
    [tab, setTab] = useState('overview'),
    [metricId, setMetric] = useState(''),
    [historySearch, setHistorySearch] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [showDeleted, setDeleted] = useState(false),
    [kind, setKind] = useState('all');
  const load = useCallback(
    () =>
      api(`/cards/${id}`)
        .then((x) => {
          setD(x);
          cachePut(`${user.id}:card:${id}`, x);
        })
        .catch(async (e) => {
          if (!e.status) {
            setD(await cacheGet(`${user.id}:card:${id}`));
          } else setErr(e.message);
        }),
    [id, user.id],
  );
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (navigator.onLine) load();
    }, 15000);
    return () => clearInterval(t);
  }, [load, revision]);
  if (err) return <div className="alert">{err}</div>;
  if (!d) return <p className="loading">Открываем карточку…</p>;
  const coach = d.link.coach_id === user.id;
  const metric = d.metrics.find((m) => m.id === metricId) || d.metrics[0];
  const entries = [
    ...d.entries.map((e) => ({ ...e, event_type: e.task_id ? 'task' : 'measurement' })),
    ...d.tasks.map((t) => ({
      id: `task-${t.id}`,
      source_id: t.id,
      event_type: 'training',
      metric_name: t.title,
      measured_at: t.updated_at,
      author_name: 'Тренировка',
      note: `${t.kind === 'in_person' ? 'Очно' : 'Онлайн'} · ${date(t.due_at)}`,
      display: { todo: 'Не начата', doing: 'Выполняется', done: 'Выполнена' }[t.status],
    })),
    ...d.reports.map((r) => ({
      id: `report-${r.id}`,
      source_id: r.id,
      event_type: 'report',
      metric_name: r.description,
      measured_at: r.submitted_at || r.created_at,
      author_name: 'Отчёт',
      note: r.response || 'Ожидает ответа',
      display: r.submitted_at ? 'Отправлен' : 'Ожидается',
    })),
  ]
    .sort((a, b) => new Date(b.measured_at) - new Date(a.measured_at))
    .filter(
      (e) =>
        (showDeleted || !e.deleted_at) &&
        e.metric_name.toLowerCase().includes(historySearch.toLowerCase()) &&
        (!from || new Date(e.measured_at) >= new Date(from)) &&
        (!to || new Date(e.measured_at) < new Date(new Date(to).getTime() + 86400000)) &&
        (kind === 'all' || e.event_type === kind),
    );
  return (
    <>
      <button className="back-btn" onClick={back}>
        <ChevronLeft size={16} />К списку
      </button>
      <div className="profile-head">
        <Avatar name={d.link.name} size="large" />
        <div>
          <span className="eyebrow">
            {coach ? 'КАРТОЧКА ПОДОПЕЧНОГО' : `МОЯ КАРТОЧКА · ${d.link.coach_name}`}
          </span>
          <h1>{d.link.name}</h1>
          <p>{d.sections.find((s) => s.title === 'Цель')?.content || 'Добавьте цель в карточке'}</p>
        </div>
        <Trend value={d.link.manual_trend || metric?.trend.status} />
        <div className="profile-actions">
          <button
            className="btn secondary"
            onClick={() => setModal({ type: 'link-settings', link: d.link })}
          >
            <Settings size={16} />
            Управление
          </button>
          <button className="btn primary" onClick={() => quick(id)}>
            <Plus size={18} />
            Записать результат
          </button>
        </div>
      </div>
      <div className="tabs card-tabs">
        {[
          ['overview', 'Обзор'],
          ['sections', 'Карточка'],
          ['tasks', 'Тренировки'],
          ['history', 'История записей'],
          ['feedback', 'Обратная связь'],
          ['audit', 'История правок'],
        ].map(([v, l]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <div className="card-grid">
          <section className="panel chart-panel">
            <div className="panel-head">
              <div>
                <h2>Динамика показателей</h2>
                <p>Порог заметного изменения: {metric?.threshold ?? 1}%</p>
              </div>
              <select
                aria-label="Показатель графика"
                value={metric?.id || ''}
                onChange={(e) => setMetric(e.target.value)}
              >
                {d.metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            {metric && (
              <>
                <div className="metric-head">
                  <b>
                    {metric.trend.last ??
                      d.entries.find((e) => e.metric_id === metric.id && !e.deleted_at)?.value ??
                      '—'}
                    <small>{metric.unit}</small>
                  </b>
                  <Trend value={metric.trend.status} />
                  <span>
                    {metric.direction === 'down'
                      ? 'Цель: снижение'
                      : metric.direction === 'target'
                        ? `Цель: ${metric.target} ${metric.unit}`
                        : 'Цель: увеличение'}
                  </span>
                </div>
                {metric.trend.plan && (
                  <p className="form-hint plan-note">
                    План к {date(metric.trend.plan.date)}: {metric.target} {metric.unit}. На дату
                    последней записи ожидается {Number(metric.trend.plan.expected.toFixed(2))}{' '}
                    {metric.unit} ·{' '}
                    {
                      {
                        on_track: 'по плану',
                        ahead: 'опережение плана',
                        behind: 'отставание от плана',
                      }[metric.trend.plan.status]
                    }
                    . Линейный план от первого замера.
                  </p>
                )}
                <Chart entries={d.entries} metric={metric} />
              </>
            )}
          </section>
          <section className="panel card-summary">
            <h2>На ближайшее время</h2>
            {d.tasks
              .filter((t) => t.status !== 'done')
              .slice(0, 3)
              .map((t) => (
                <button className="mini-task" key={t.id} onClick={() => openTask(t.id)}>
                  <CalendarDays size={18} />
                  <span>
                    <b>{t.title}</b>
                    <small>
                      {date(t.due_at)} · {date(t.due_at, { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!d.tasks.filter((t) => t.status !== 'done').length && (
              <p className="muted">Все тренировки завершены</p>
            )}
            {coach && (
              <button
                className="btn secondary"
                onClick={() => setModal({ type: 'new-task', link_id: id })}
              >
                <Plus size={16} />
                Новая тренировка
              </button>
            )}
          </section>
          <section className="panel reports-panel">
            <div className="panel-head">
              <h2>Запрошенные отчёты</h2>
              {coach && (
                <button className="text-btn" onClick={() => setModal({ type: 'report', id })}>
                  <Plus size={16} />
                  Нужен отчёт
                </button>
              )}
            </div>
            {d.reports.length ? (
              d.reports.map((r) => (
                <div className="report-row" key={r.id}>
                  <FileText size={20} />
                  <div>
                    <b>{r.description}</b>
                    <small>
                      До {date(r.due_at)} · {r.submitted_at ? 'Отправлен' : 'Ожидает ответа'}
                    </small>
                    {r.response && <p>{r.response}</p>}
                  </div>
                  {!r.submitted_at && (
                    <button
                      className="btn secondary"
                      onClick={() => setModal({ type: 'report-answer', report: r })}
                    >
                      Ответить
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="muted inset">Нет запрошенных отчётов</p>
            )}
          </section>
        </div>
      )}
      {tab === 'sections' && (
        <>
          <div className="section-actions">
            {coach && (
              <>
                <button className="btn secondary" onClick={() => setModal({ type: 'section', id })}>
                  <Plus size={16} />
                  Раздел
                </button>
                <button
                  className="btn secondary"
                  onClick={() => setModal({ type: 'metric', id, sections: d.sections })}
                >
                  <Plus size={16} />
                  Показатель
                </button>
                <button
                  className="btn secondary"
                  onClick={() => setModal({ type: 'card-template', id, card: d })}
                >
                  Шаблон карточки
                </button>
              </>
            )}
          </div>
          <div className="section-grid">
            {d.sections.map((s) => (
              <section className="panel section-card" key={s.id}>
                <div>
                  <h2>{s.title}</h2>
                  {!s.visible && <span className="private-badge">Только тренеру</span>}
                </div>
                <p className="section-text">{s.content || 'Пока не заполнено'}</p>
                {d.metrics
                  .filter((m) => m.section_id === s.id)
                  .map((m) => (
                    <div className="parameter" key={m.id}>
                      <span>
                        {m.name}
                        <small>
                          {
                            {
                              trainer: 'Заполняет тренер',
                              shared: 'Общее заполнение',
                              system: 'Системный параметр · ручная правка доступна',
                            }[m.owner]
                          }
                        </small>
                      </span>
                      <b>
                        {d.entries.find((e) => e.metric_id === m.id && !e.deleted_at)?.value ??
                          m.current_value ??
                          '—'}{' '}
                        {m.unit}
                      </b>
                      {coach && (
                        <button
                          className="icon-btn"
                          title="Настроить показатель"
                          onClick={() =>
                            setModal({ type: 'metric', id, metric: m, sections: d.sections })
                          }
                        >
                          <Settings size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                {(coach || s.editable) && (
                  <button
                    className="text-btn"
                    onClick={() => setModal({ type: 'section', id, section: s, coach })}
                  >
                    Редактировать <ArrowUpRight size={15} />
                  </button>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {tab === 'tasks' && (
        <section className="panel">
          {d.tasks.map((t) => (
            <button className="task-row" key={t.id} onClick={() => openTask(t.id)}>
              <CalendarDays size={20} />
              <div className="task-info">
                <b>{t.title}</b>
                <small>
                  {date(t.due_at)} · {t.kind === 'in_person' ? 'Очно' : 'Онлайн'}
                </small>
              </div>
              <Status task={t} />
              <ChevronRight size={18} />
            </button>
          ))}
        </section>
      )}
      {tab === 'history' && (
        <>
          <div className="history-filters">
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Поиск показателя"
                placeholder="Поиск по показателю"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </label>
            <Field label="С">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="По">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <select aria-label="Тип записи" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Все записи</option>
              <option value="measurement">Замеры</option>
              <option value="task">Результаты к тренировке</option>
              <option value="training">Тренировки</option>
              <option value="report">Отчёты</option>
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setDeleted(e.target.checked)}
              />
              Удалённые
            </label>
          </div>
          <section className="panel">
            {entries.map((e) => (
              <div className={`entry-row ${e.deleted_at ? 'deleted' : ''}`} key={e.id}>
                <span className="entry-icon">
                  <Activity size={18} />
                </span>
                <div>
                  <b>{e.metric_name}</b>
                  <small>
                    {date(e.measured_at)} · {e.author_name}
                    {e.task_id ? ' · Тренировка' : ''}
                  </small>
                  {e.note && <p>{e.note}</p>}
                </div>
                <strong>
                  {e.display ? (
                    <small>{e.display}</small>
                  ) : (
                    <>
                      {e.value} <small>{e.unit}</small>
                    </>
                  )}
                </strong>
                {!['training', 'report'].includes(e.event_type) &&
                  (coach || e.author_id === user.id) && (
                    <button
                      className="icon-btn"
                      title={e.deleted_at ? 'Восстановить' : 'Удалить'}
                      onClick={() => setModal({ type: 'entry-delete', entry: e })}
                    >
                      {e.deleted_at ? <RefreshCw size={16} /> : <Trash2 size={16} />}
                    </button>
                  )}
              </div>
            ))}
            {!entries.length && (
              <Empty title="Записей не найдено" text="Добавьте результат или измените фильтры." />
            )}
          </section>
        </>
      )}
      {tab === 'feedback' && (
        <>
          <div className="section-actions">
            <button className="btn primary" onClick={() => setModal({ type: 'summary', id })}>
              Подготовить сводку
            </button>
          </div>
          {d.summaries.map((s) => (
            <Summary key={s.id} s={s} coach={coach} setModal={setModal} />
          ))}
          {!d.summaries.length && (
            <Empty
              title="Обратной связи пока нет"
              text="Запросите сводку. Она появится после проверки тренером."
            />
          )}
        </>
      )}
      {tab === 'audit' && (
        <section className="panel audit-list">
          {d.history.map((a) => (
            <details key={a.id}>
              <summary>
                <span className="audit-dot" />
                <span>
                  <b>{a.actor_name}</b> ·{' '}
                  {{
                    section: 'Раздел карточки',
                    metric: 'Показатель',
                    entry: 'Запись результата',
                    task: 'Тренировка',
                  }[a.entity_type] || a.entity_type}
                  <small>
                    {date(a.created_at, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </span>
                <ChevronRight size={15} />
              </summary>
              <div className="audit-detail">
                <p>
                  {a.entity_type === 'section'
                    ? `Было: ${a.before_data?.content || 'пусто'} → Стало: ${a.after_data?.content || 'пусто'}`
                    : a.entity_type === 'entry'
                      ? `${a.after_data?.value} · ${a.after_data?.deleted_at ? 'удалено' : 'сохранено'}`
                      : `${a.after_data?.title} · версия ${a.after_data?.version}`}
                </p>
                {a.entity_type === 'metric' && (
                  <p>
                    {a.before_data?.name}: {a.before_data?.direction} → {a.after_data?.direction};
                    порог {a.before_data?.threshold}% → {a.after_data?.threshold}%
                  </p>
                )}
                {a.entity_type === 'task' && (
                  <pre>{JSON.stringify(a.after_data?.exercises, null, 2)}</pre>
                )}
                {coach && ['section', 'metric'].includes(a.entity_type) && a.before_data && (
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      try {
                        await api(`/history/${a.id}/restore`, {});
                        notify('Предыдущее значение восстановлено');
                        load();
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    Откатить правку
                  </button>
                )}
              </div>
            </details>
          ))}
          {!d.history.length && (
            <Empty
              title="Изменений пока нет"
              text="Здесь появятся автор, время и содержание правок."
            />
          )}
        </section>
      )}
    </>
  );
}
function Summary({ s, coach, setModal }) {
  return (
    <section className="panel summary-card">
      <div className="summary-head">
        <div>
          <span className="eyebrow">
            {date(s.period_start)} — {date(s.period_end)}
          </span>
          <h2>{s.name || 'Сводка по подопечному'}</h2>
        </div>
        <span className={`status ${s.published ? 'done' : 'todo'}`}>
          {s.published ? 'Опубликована' : 'На проверке'}
        </span>
      </div>
      <div className="summary-counts">
        <span>
          <b>{s.data.completed}</b>выполнено
        </span>
        <span>
          <b>{s.data.missed}</b>пропущено
        </span>
        <span>
          <b>{s.data.total}</b>всего тренировок
        </span>
      </div>
      <div className="summary-metrics">
        {s.data.metrics.map((m) => (
          <div key={m.id}>
            <span>{m.name}</span>
            <b>
              {m.first ?? '—'} → {m.last ?? '—'} {m.unit}
            </b>
            <Trend value={m.status} />
          </div>
        ))}
      </div>
      {s.data.overdue?.length > 0 && (
        <details className="summary-overdue">
          <summary>Просрочено: {s.data.overdue.length}</summary>
          {s.data.overdue.map((t) => (
            <button
              key={t.id}
              className="text-btn"
              onClick={() => setModal({ type: 'task-detail', id: t.id })}
            >
              {t.title} · {date(t.due_at)}
            </button>
          ))}
        </details>
      )}
      <div className="automatic">
        <span className="eyebrow">АВТОМАТИЧЕСКИ</span>
        <p>{s.automatic_text}</p>
      </div>
      {s.personal_comment && (
        <div className="personal">
          <b>Комментарий тренера</b>
          <p>{s.personal_comment}</p>
        </div>
      )}
      {coach && (
        <button
          className="text-btn"
          onClick={() => setModal({ type: 'publish-summary', summary: s })}
        >
          Проверить и дополнить <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}
function Summaries({ data, mode, setModal, done }) {
  const [schedules, setSchedules] = useState([]);
  useEffect(() => {
    if (mode === 'coach') api('/schedules').then(setSchedules);
  }, [data, mode]);
  return (
    <>
      <Heading
        eyebrow="ДАННЫЕ СТАНОВЯТСЯ ПОНЯТНЕЕ"
        title="Сводки и обратная связь"
        description="Результаты периода и личный комментарий тренера."
      >
        {mode === 'coach' && (
          <>
            <button className="btn secondary" onClick={() => setModal({ type: 'schedule' })}>
              <Clock size={17} />
              Расписание сводок
            </button>
            <button
              className="btn primary"
              disabled={!data.links.length}
              onClick={() => setModal({ type: 'summary' })}
            >
              <Plus size={18} />
              Собрать сводку
            </button>
          </>
        )}
      </Heading>
      {mode === 'coach' && schedules.length > 0 && (
        <section className="panel schedules">
          <h3>Автоматический сбор</h3>
          {schedules.map((s) => (
            <div key={s.id}>
              <span>
                {data.links.find((l) => l.id === s.link_id)?.name ||
                  data.groups.find((g) => g.id === s.group_id)?.name ||
                  'Все подопечные'}{' '}
                ·{' '}
                {
                  {
                    week: 'каждую неделю',
                    fortnight: 'раз в две недели',
                    month: 'раз в месяц',
                    custom: `каждые ${s.days} дн.`,
                  }[s.frequency]
                }{' '}
                · {s.auto_send ? 'сразу отправлять' : 'проверка тренером'}
              </span>
              <button
                className="icon-btn"
                aria-label="Удалить расписание"
                onClick={async () => {
                  await api(`/schedules/${s.id}`, {}, 'DELETE');
                  done('Расписание удалено');
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="summaries-grid">
        {data.summaries.map((s) => (
          <Summary key={s.id} s={s} coach={mode === 'coach'} setModal={setModal} />
        ))}
      </div>
      {!data.summaries.length && (
        <Empty
          title="Первая сводка уже близко"
          text="Выберите период или настройте автоматический сбор."
        />
      )}
    </>
  );
}
function Templates({ data, setModal, done }) {
  return (
    <>
      <Heading
        eyebrow="ВАШИ ГОТОВЫЕ РЕШЕНИЯ"
        title="Шаблоны"
        description="Сохраните упражнения, чтобы быстрее собирать тренировки."
      >
        <button className="btn primary" onClick={() => setModal({ type: 'new-template' })}>
          <Plus size={18} />
          Создать шаблон
        </button>
      </Heading>
      <div className="group-grid">
        {data.templates.map((t) => (
          <section className="panel template-card" key={t.id}>
            <FileText size={25} />
            <span className="eyebrow">{t.kind === 'task' ? 'ТРЕНИРОВКА' : 'КАРТОЧКА'}</span>
            <h2>{t.name}</h2>
            <p>
              {t.data.length} {t.kind === 'task' ? 'упражнений' : 'разделов'}
            </p>
            {t.kind === 'task' && (
              <>
                <ul>
                  {t.data.map((e) => (
                    <li key={e.id}>
                      {e.title} · {e.sets.length} подхода
                    </li>
                  ))}
                </ul>
                <button
                  className="btn secondary"
                  disabled={!data.links.length}
                  onClick={() => setModal({ type: 'new-task', template: t })}
                >
                  Создать тренировку
                </button>
              </>
            )}
          </section>
        ))}
      </div>
      {!data.templates.length && (
        <Empty
          title="Ваши шаблоны появятся здесь"
          text="Начните с тренировки, которую проводите чаще всего."
        />
      )}
    </>
  );
}
function SettingsPage({ user, setUser, notify, setModal }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(user.public_id, {
      width: 180,
      margin: 1,
      color: { dark: '#163b34', light: '#ffffff' },
    }).then(setQr);
  }, [user.public_id]);
  return (
    <>
      <Heading
        eyebrow="ВАШ ПРОФИЛЬ"
        title="Настройки"
        description="Один аккаунт для обеих ролей."
      />
      <div className="settings-grid">
        <section className="panel settings-profile">
          <Avatar name={user.name} size="large" />
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="eyebrow">МОЙ ID</span>
          <button
            className="id-copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(user.public_id);
                notify('ID скопирован');
              } catch {
                notify(`Ваш ID: ${user.public_id}`);
              }
            }}
          >
            {user.public_id}
            <Copy size={16} />
          </button>
          {qr && (
            <img src={qr} alt={`QR-код вашего ID ${user.public_id}`} width="180" height="180" />
          )}
          <p className="muted">
            Покажите код или отправьте ID тренеру.
            <br />
            Связь появится после вашего согласия.
          </p>
          <button className="btn secondary" onClick={() => setModal({ type: 'scan' })}>
            <ScanLine size={17} />
            Сканировать QR
          </button>
        </section>
        <section className="panel settings-form">
          <h2>Уведомления</h2>
          <Form
            onSubmit={async (b, form) => {
              const prefs = {
                reminderTime: b.reminderTime,
                timezone: b.timezone,
                important: b.important,
                disabled: ['task', 'report', 'summary', 'reminder', 'important'].filter(
                  (k) => !form.elements[`n-${k}`].checked,
                ),
              };
              await api('/preferences', prefs, 'PUT');
              setUser({ ...user, preferences: prefs });
              notify('Настройки сохранены');
            }}
          >
            <div className="form-row">
              <Field
                label="Время напоминаний"
                name="reminderTime"
                type="time"
                required
                defaultValue={user.preferences.reminderTime}
              />
              <Field label="Часовой пояс">
                <select name="timezone" defaultValue={user.preferences.timezone}>
                  {[
                    'Asia/Yekaterinburg',
                    'Europe/Moscow',
                    'Asia/Novosibirsk',
                    'Asia/Vladivostok',
                    'UTC',
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Важные комментарии">
              <select name="important" defaultValue={user.preferences.important}>
                <option value="all">Для всех тренировок</option>
                <option value="in_person">Только для очных</option>
                <option value="off">Отключить</option>
              </select>
            </Field>
            {[
              ['task', 'Новые тренировки'],
              ['report', 'Запросы отчётов'],
              ['summary', 'Готовые сводки'],
              ['reminder', 'Напоминания в день тренировки'],
              ['important', 'Важные комментарии'],
            ].map(([v, l]) => (
              <label className="checkbox setting-check" key={v}>
                <input
                  type="checkbox"
                  name={`n-${v}`}
                  defaultChecked={!user.preferences.disabled.includes(v)}
                />
                {l}
              </label>
            ))}
          </Form>
          <div className="push-box">
            <h3>Уведомления браузера</h3>
            <p>
              Внутри сервиса уведомления работают сразу. Для доставки в закрытый браузер нужны Web
              Push и разрешение.
            </p>
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  const me = await api('/me');
                  if (!me.pushKey)
                    throw new Error('Сервер Web Push ещё не настроен: нужны ключи VAPID в .env.');
                  if (!('serviceWorker' in navigator))
                    throw new Error('Этот браузер не поддерживает Web Push');
                  const permission = await Notification.requestPermission();
                  if (permission !== 'granted')
                    throw new Error('Разрешение на уведомления не получено');
                  const registration = await navigator.serviceWorker.register('/sw.js');
                  await navigator.serviceWorker.ready;
                  const base64 = me.pushKey.replace(/-/g, '+').replace(/_/g, '/');
                  const key = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
                  const sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: key,
                  });
                  await api('/push', sub.toJSON());
                  notify('Уведомления браузера включены');
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              <Bell size={16} />
              Включить Web Push
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
function Notifications({ data, mode, openCard, openTask, reload, notify }) {
  const [invites, setInvites] = useState([]);
  useEffect(() => {
    api('/invitations').then(setInvites);
  }, [data]);
  return (
    <>
      <Heading
        eyebrow="НИЧЕГО НЕ УПУСТИТЬ"
        title="Уведомления"
        description="Приглашения, тренировки и важные комментарии."
      >
        <button
          className="btn secondary"
          onClick={async () => {
            await api('/notifications/read', { mode });
            reload();
          }}
        >
          Прочитать все
        </button>
      </Heading>
      <section className="panel">
        {invites.map((i) => (
          <div className="notification-row" key={i.id}>
            <Users size={21} />
            <div>
              <b>
                {i.coach_name} приглашает вас{' '}
                {i.group_name ? `в группу ${i.group_name}` : 'стать подопечным'}
              </b>
              <small>До {date(i.expires_at)}</small>
            </div>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await api('/invitations/respond', { id: i.id, accept: true });
                  reload();
                  notify('Приглашение принято. Переключитесь в режим подопечного.');
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              Принять
            </button>
            <button
              className="btn secondary"
              onClick={async () => {
                await api('/invitations/respond', { id: i.id, accept: false });
                reload();
              }}
            >
              Отклонить
            </button>
          </div>
        ))}
        {data.notifications.map((n) => (
          <button
            className={`notification-row ${n.read_at ? '' : 'unread'}`}
            key={n.id}
            onClick={() =>
              n.task_id ? openTask(n.task_id) : n.link_id ? openCard(n.link_id) : null
            }
          >
            <Bell size={19} />
            <div>
              <b>{n.body}</b>
              <small>
                {date(n.created_at, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </small>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
        {!data.notifications.length && !invites.length && (
          <Empty title="Вы ничего не пропустили" text="Новые события появятся здесь." />
        )}
      </section>
    </>
  );
}
function Modals({ modal, user, mode, data, setModal, done, notify, reload, setPending }) {
  const close = () => setModal(null);
  const props = { modal, user, mode, data, close, done, notify, reload, setPending };
  if (modal.type === 'quick') return <Quick {...props} />;
  if (modal.type === 'summary') return <SummaryForm {...props} />;
  if (['new-task', 'new-template', 'task-detail'].includes(modal.type))
    return <TaskEditor {...props} />;
  if (modal.type === 'invite') return <Invite {...props} />;
  if (modal.type === 'scan') return <Scanner {...props} />;
  if (modal.type === 'group-members') return <GroupMembers {...props} />;
  if (modal.type === 'card-template') return <CardTemplate {...props} />;
  const title = {
    group: modal.group ? 'Настройки группы' : 'Новая группа',
    section: modal.section ? 'Редактировать раздел' : 'Новый раздел',
    metric: modal.metric ? 'Настройки показателя' : 'Новый показатель',
    report: 'Запросить отчёт',
    'report-answer': 'Отправить отчёт',
    summary: 'Подготовить сводку',
    schedule: 'Автоматические сводки',
    'publish-summary': 'Обратная связь',
    'entry-delete': modal.entry?.deleted_at ? 'Восстановить запись' : 'Удалить запись',
    'link-settings': 'Управление связью',
  }[modal.type];
  return (
    <Modal title={title} close={close}>
      {modal.type === 'group' && (
        <Form
          onSubmit={async (b) => {
            await api(
              modal.group ? `/groups/${modal.group.id}` : '/groups',
              { ...b, archived: b.archived === 'on' },
              modal.group ? 'PUT' : 'POST',
            );
            done('Группа сохранена');
          }}
        >
          <Field label="Название" name="name" required defaultValue={modal.group?.name} />
          <Field
            label="Расписание"
            name="schedule"
            placeholder="Пн, Ср, Пт · 09:00"
            defaultValue={modal.group?.schedule}
          />
          <Field label="Общие заметки">
            <textarea name="notes" defaultValue={modal.group?.notes} />
          </Field>
          {modal.group && (
            <label className="checkbox">
              <input type="checkbox" name="archived" defaultChecked={modal.group.archived} />В
              архиве
            </label>
          )}
        </Form>
      )}
      {modal.type === 'section' && (
        <Form
          onSubmit={async (b) => {
            const s = modal.section,
              coach = modal.coach !== false;
            const body = {
              title: coach ? b.title : s.title,
              content: b.content,
              visible: coach ? b.visible === 'on' : s.visible,
              editable: coach ? b.editable === 'on' : s.editable,
              version: s?.version,
            };
            await api(
              s ? `/sections/${s.id}` : `/cards/${modal.id}/sections`,
              body,
              s ? 'PUT' : 'POST',
            );
            done('Раздел сохранён');
          }}
        >
          <Field
            label="Название"
            name="title"
            required
            defaultValue={modal.section?.title}
            readOnly={modal.coach === false}
          />
          <Field label="Содержание">
            <textarea name="content" rows="5" defaultValue={modal.section?.content} />
          </Field>
          {modal.coach !== false && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="visible"
                  defaultChecked={modal.section?.visible ?? true}
                />
                Показывать подопечному
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="editable"
                  defaultChecked={modal.section?.editable ?? true}
                />
                Подопечный может редактировать
              </label>
            </>
          )}
        </Form>
      )}
      {modal.type === 'metric' && (
        <Form
          onSubmit={async (b) => {
            await api(
              modal.metric ? `/metrics/${modal.metric.id}` : `/cards/${modal.id}/metrics`,
              {
                ...b,
                section_id: b.section_id || null,
                target: b.target === '' ? null : Number(b.target),
                target_date: b.target_date || null,
                threshold: Number(b.threshold),
                version: modal.metric?.version,
              },
              modal.metric ? 'PUT' : 'POST',
            );
            done(
              modal.metric
                ? 'Настройки показателя сохранены'
                : 'Показатель появился в быстром вводе и графиках',
            );
          }}
        >
          <div className="form-row">
            <Field
              label="Показатель"
              name="name"
              defaultValue={modal.metric?.name}
              placeholder="Например, время на 1 км"
              required
            />
            <Field
              label="Единица измерения"
              name="unit"
              defaultValue={modal.metric?.unit}
              placeholder="мин"
            />
          </div>
          <Field label="Раздел">
            <select name="section_id" defaultValue={modal.metric?.section_id}>
              {modal.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Цель">
            <select name="direction" defaultValue={modal.metric?.direction}>
              <option value="up">Увеличение — улучшение</option>
              <option value="down">Снижение — улучшение</option>
              <option value="target">Приближение к значению</option>
            </select>
          </Field>
          <div className="form-row">
            <Field
              label="Целевое значение (если нужно)"
              name="target"
              defaultValue={modal.metric?.target ?? ''}
              type="number"
              step="any"
            />
            <Field
              label="Порог изменения, %"
              name="threshold"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={modal.metric?.threshold ?? 1}
              required
            />
          </div>
          <Field
            label="Достичь цели к дате (необязательно)"
            name="target_date"
            type="date"
            defaultValue={modal.metric?.target_date || ''}
          />
          <Field label="Кто заполняет">
            <select name="owner" defaultValue={modal.metric?.owner}>
              <option value="shared">Тренер и подопечный</option>
              <option value="trainer">Только тренер</option>
              <option value="system">Считает система, ручная правка доступна</option>
            </select>
          </Field>
          <p className="form-hint">
            Автоматическое обновление карточки из новых записей относится к этапу 6. В этой версии
            сохраняются записи и история.
          </p>
        </Form>
      )}
      {modal.type === 'report' && (
        <Form
          submit="Запросить отчёт"
          onSubmit={async (b) => {
            await api(`/cards/${modal.id}/reports`, {
              ...b,
              due_at: new Date(b.due_at).toISOString(),
            });
            done('Запрос появился у подопечного');
          }}
        >
          <Field label="Что нужно прислать">
            <textarea
              name="description"
              required
              placeholder="Как прошла неделя? Самочувствие и выполненные тренировки."
            />
          </Field>
          <Field
            label="Срок"
            name="due_at"
            type="datetime-local"
            required
            defaultValue={dt(new Date(Date.now() + 86400000))}
          />
        </Form>
      )}
      {modal.type === 'report-answer' && (
        <Form
          submit="Отправить отчёт"
          onSubmit={async (b) => {
            await api(`/reports/${modal.report.id}`, b, 'PUT');
            done('Отчёт отправлен');
          }}
        >
          <p>{modal.report.description}</p>
          <Field label="Ваш ответ">
            <textarea name="response" rows="6" required />
          </Field>
        </Form>
      )}
      {modal.type === 'summary' && (
        <Form
          submit="Собрать сводку"
          onSubmit={async (b) => {
            await api(`/cards/${b.link_id || modal.id}/summaries`, {
              start: new Date(b.start).toISOString(),
              end: new Date(b.end).toISOString(),
            });
            done(
              mode === 'coach'
                ? 'Сводка готова к проверке'
                : 'Сводка отправлена тренеру на проверку',
            );
          }}
        >
          {!modal.id && (
            <Field label="Подопечный">
              <select name="link_id">
                {data.links.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-row">
            <Field
              label="Начало периода"
              type="datetime-local"
              name="start"
              required
              defaultValue={dt(new Date(Date.now() - 7 * 86400000))}
            />
            <Field
              label="Конец (не включительно)"
              type="datetime-local"
              name="end"
              required
              defaultValue={dt(new Date())}
            />
          </div>
          <p className="form-hint">
            Сервер соберёт тренировки, показатели и динамику. Перед отправкой тренер проверяет
            сводку.
          </p>
        </Form>
      )}
      {modal.type === 'schedule' && (
        <Form
          onSubmit={async (b) => {
            const [scope, id] = b.scope.split(':');
            await api('/schedules', {
              link_id: scope === 'link' ? id : null,
              group_id: scope === 'group' ? id : null,
              frequency: b.frequency,
              days: Number(b.days || 7),
              auto_send: b.auto_send === 'on',
            });
            done('Расписание сохранено. Первый сбор — в течение минуты.');
          }}
        >
          <Field label="Для кого">
            <select name="scope">
              <option value="all">Все мои подопечные</option>
              {data.links
                .filter((l) => !l.archived)
                .map((l) => (
                  <option key={l.id} value={`link:${l.id}`}>
                    {l.name}
                  </option>
                ))}
              {data.groups
                .filter((g) => !g.archived)
                .map((g) => (
                  <option key={g.id} value={`group:${g.id}`}>
                    Группа: {g.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Как часто">
            <select name="frequency">
              <option value="week">Неделя</option>
              <option value="fortnight">Две недели</option>
              <option value="month">Месяц</option>
              <option value="custom">Свой интервал</option>
            </select>
          </Field>
          <Field
            label="Дней для своего интервала"
            name="days"
            type="number"
            min="1"
            max="365"
            defaultValue="7"
          />
          <label className="checkbox">
            <input type="checkbox" name="auto_send" />
            Отправлять сразу, без проверки тренером
          </label>
        </Form>
      )}
      {modal.type === 'publish-summary' && (
        <Form
          submit="Сохранить обратную связь"
          onSubmit={async (b) => {
            await api(
              `/summaries/${modal.summary.id}`,
              { personal_comment: b.personal_comment, published: b.published === 'on' },
              'PUT',
            );
            done('Обратная связь сохранена');
          }}
        >
          <div className="automatic">
            <span className="eyebrow">АВТОМАТИЧЕСКИ</span>
            <p>{modal.summary.automatic_text}</p>
          </div>
          <Field label="Личный комментарий тренера">
            <textarea
              name="personal_comment"
              rows="5"
              defaultValue={modal.summary.personal_comment}
            />
          </Field>
          <label className="checkbox">
            <input type="checkbox" name="published" defaultChecked={modal.summary.published} />
            Опубликовать в профиле подопечного
          </label>
        </Form>
      )}
      {modal.type === 'entry-delete' && (
        <Form
          submit={modal.entry.deleted_at ? 'Восстановить' : 'Удалить запись'}
          onSubmit={async () => {
            await api(`/entries/${modal.entry.id}`, { deleted: !modal.entry.deleted_at }, 'PATCH');
            done(
              modal.entry.deleted_at
                ? 'Запись восстановлена'
                : 'Запись удалена. В истории её можно вернуть.',
            );
          }}
        >
          <p>
            {modal.entry.metric_name}:{' '}
            <b>
              {modal.entry.value} {modal.entry.unit}
            </b>{' '}
            · {date(modal.entry.measured_at)}
          </p>
          <p className="form-hint">
            История сохраняется. Удалённую запись можно найти через фильтр «Удалённые» и
            восстановить.
          </p>
        </Form>
      )}
      {modal.type === 'link-settings' && (
        <Form
          onSubmit={async (b) => {
            if (b.leave === 'on') await api(`/links/${modal.link.id}`, { status: 'left' }, 'PATCH');
            else if (modal.link.coach_id === user.id)
              await api(
                `/links/${modal.link.id}`,
                { archived: b.archived === 'on', manual_trend: b.manual_trend || null },
                'PATCH',
              );
            done('Настройки связи сохранены');
          }}
        >
          {modal.link.coach_id === user.id && (
            <>
              <Field label="Пометка динамики">
                <select name="manual_trend" defaultValue={modal.link.manual_trend || ''}>
                  <option value="">Автоматический расчёт</option>
                  <option value="up">Растёт</option>
                  <option value="flat">Стоит</option>
                  <option value="down">Падает</option>
                </select>
              </Field>
              <label className="checkbox">
                <input type="checkbox" name="archived" defaultChecked={modal.link.archived} />
                Архивировать подопечного (история сохранится)
              </label>
            </>
          )}
          <label className="checkbox danger-text">
            <input type="checkbox" name="leave" />
            Завершить связь с{' '}
            {modal.link.coach_id === user.id ? modal.link.name : modal.link.coach_name}
          </label>
          <p className="form-hint">
            После выхода данные связи станут недоступны обоим участникам. Для возобновления
            потребуется новое приглашение.
          </p>
        </Form>
      )}
    </Modal>
  );
}
function Invite({ data, close, notify }) {
  const [url, setUrl] = useState(''),
    [qr, setQr] = useState('');
  return (
    <Modal
      title="Добавить подопечного"
      subtitle="Подопечный сам подтверждает приглашение"
      close={close}
    >
      <Form
        submit="Создать приглашение"
        onSubmit={async (b) => {
          const result = await api('/invitations', {
            public_id: b.public_id || undefined,
            group_id: b.group_id || null,
          });
          setUrl(result.url);
          QRCode.toDataURL(result.url, { width: 180, margin: 1 }).then(setQr);
        }}
      >
        <Field
          label="ID зарегистрированного человека (необязательно)"
          name="public_id"
          placeholder="CP-XXXXXXXX"
        />
        <Field label="Добавить в группу">
          <select name="group_id">
            <option value="">Без группы</option>
            {data.groups
              .filter((g) => !g.archived)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
        <p className="form-hint">
          Оставьте ID пустым, чтобы создать ссылку для нового человека. Ссылка действует 7 дней.
        </p>
      </Form>
      {url && (
        <div className="invite-result">
          <h3>Приглашение готово</h3>
          <input
            readOnly
            value={url}
            aria-label="Ссылка приглашения"
            onFocus={(e) => e.target.select()}
          />
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                notify('Ссылка скопирована');
              } catch {
                notify('Выделите и скопируйте ссылку вручную');
              }
            }}
          >
            <Copy size={16} />
            Скопировать ссылку
          </button>
          {qr && <img src={qr} width="180" height="180" alt="QR-код приглашения" />}
          <p>Отправьте ссылку подопечному. После регистрации он подтвердит связь.</p>
        </div>
      )}
    </Modal>
  );
}
function GroupMembers({ modal, data, close, done, notify }) {
  const [members, setMembers] = useState(modal.group.members);
  return (
    <Modal title={`Участники · ${modal.group.name}`} close={close}>
      <div className="member-select">
        {data.links
          .filter((l) => !l.archived)
          .map((l) => (
            <label className="checkbox" key={l.id}>
              <input
                type="checkbox"
                checked={members.some((m) => m.id === l.id)}
                onChange={async (e) => {
                  const add = e.target.checked;
                  try {
                    await api(`/groups/${modal.group.id}/members`, { link_id: l.id, remove: !add });
                    setMembers((m) =>
                      add ? [...m, { id: l.id, name: l.name }] : m.filter((x) => x.id !== l.id),
                    );
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              />
              <Avatar name={l.name} size="small" />
              {l.name}
            </label>
          ))}
      </div>
      <button className="btn primary" onClick={() => done('Состав группы обновлён')}>
        Готово
      </button>
    </Modal>
  );
}
function CardTemplate({ modal, data, close, done }) {
  return (
    <Modal title="Шаблоны карточки" close={close}>
      <Form
        submit="Сохранить структуру как шаблон"
        onSubmit={async (b) => {
          await api('/templates', {
            name: b.name,
            kind: 'card',
            data: modal.card.sections.map((s) => ({
              title: s.title,
              visible: s.visible,
              editable: s.editable,
              metrics: modal.card.metrics
                .filter((m) => m.section_id === s.id)
                .map((m) => ({
                  name: m.name,
                  unit: m.unit,
                  direction: m.direction,
                  target: m.target,
                  threshold: m.threshold,
                  owner: m.owner,
                  current_value: null,
                })),
            })),
          });
          done('Структура сохранена без личных значений');
        }}
      >
        <Field label="Название нового шаблона" name="name" required />
        <p className="form-hint">
          Сохраняются названия разделов, параметры и права. Личные заметки и результаты не
          копируются.
        </p>
      </Form>
      <hr />
      <Form
        submit="Добавить разделы из шаблона"
        onSubmit={async (b) => {
          if (!b.template_id) throw new Error('Сначала создайте шаблон карточки');
          await api(`/cards/${modal.id}/apply-template`, b);
          done('Разделы добавлены');
        }}
      >
        <Field label="Сохранённая структура">
          <select name="template_id" required>
            <option value="">Выберите шаблон</option>
            {data.templates
              .filter((t) => t.kind === 'card')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
      </Form>
    </Modal>
  );
}
function Quick({ modal, user, data, close, done, notify, setPending }) {
  const [link, setLink] = useState(modal.id || ''),
    [card, setCard] = useState(null),
    [metricId, setMetricId] = useState(''),
    [value, setValue] = useState(''),
    [error, setError] = useState('');
  const started = useRef(performance.now()),
    operation = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    setCard(null);
    const load = async () => {
      try {
        const c = await api(`/cards/${link}`);
        await cachePut(`${user.id}:card:${link}`, c);
        if (active) setCard(c);
      } catch (e) {
        const c = await cacheGet(`${user.id}:card:${link}`);
        if (active) {
          if (c) setCard(c);
          else setError('Нет сохранённой карточки. Сначала откройте её с подключением к сети.');
        }
      }
    };
    if (link) load();
    return () => {
      active = false;
    };
  }, [link, user.id]);
  const coach = card?.link.coach_id === user.id;
  const metrics =
    card?.metrics.filter(
      (m) =>
        coach ||
        (m.owner !== 'trainer' &&
          card.sections.find((s) => s.id === m.section_id)?.editable !== false),
    ) || [];
  const metric = metrics.find((m) => m.id === metricId) || metrics[0];
  useEffect(() => {
    if (metric) {
      const last = card.entries.find((e) => e.metric_id === metric.id && !e.deleted_at);
      setValue(
        last
          ? String(last.value)
          : metric.current_value !== null
            ? String(metric.current_value)
            : '',
      );
    }
  }, [metric?.id, card]);
  return (
    <Modal
      title="Быстрая запись"
      subtitle="Прошлое значение уже здесь. Измените и сохраните."
      close={close}
    >
      <Form
        submit="Сохранить результат"
        onSubmit={async (b) => {
          if (!metric) throw new Error('Нет доступных для записи показателей');
          if (value === '') throw new Error('Введите значение');
          const body = {
            client_user_id: user.id,
            metric_id: metric.id,
            value: Number(value),
            measured_at: new Date(b.measured_at).toISOString(),
            task_id: b.task_id || null,
            note: b.note || '',
            operation_id: operation.current,
            elapsed_ms: Math.round(performance.now() - started.current),
          };
          try {
            await api(`/cards/${link}/entries`, body);
          } catch (e) {
            if (e.status) throw e;
            await enqueue(user.id, link, body);
            setPending((await queued(user.id)).length);
            done('Запись сохранена на устройстве. Отправим после подключения.');
            return;
          }
          done(`Результат сохранён за ${(body.elapsed_ms / 1000).toFixed(1)} с`);
        }}
      >
        <Field label="Карточка">
          <select
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setMetricId('');
              operation.current = crypto.randomUUID();
            }}
          >
            <option value="">Выберите человека</option>
            {data.links
              .filter((l) => !l.archived)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {modeLabel(l, user)}
                </option>
              ))}
          </select>
        </Field>
        {error && <div className="alert">{error}</div>}
        {card && (
          <>
            <Field label="Показатель">
              <select
                value={metric?.id || ''}
                onChange={(e) => {
                  setMetricId(e.target.value);
                  operation.current = crypto.randomUUID();
                }}
              >
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.unit}
                  </option>
                ))}
              </select>
            </Field>
            <div className="quick-value">
              <Counter value={value} onChange={setValue} />
              <span>{metric?.unit}</span>
              <small>Как в прошлый раз — или ваше новое значение</small>
            </div>
            <Field
              label="Дата и время"
              name="measured_at"
              type="datetime-local"
              required
              defaultValue={dt(new Date())}
            />
            <details className="quick-extra">
              <summary>Привязать к тренировке или добавить заметку</summary>
              <Field label="Тренировка">
                <select name="task_id">
                  <option value="">Без привязки</option>
                  {card.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} · {date(t.due_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Заметка" name="note" />
            </details>
          </>
        )}
      </Form>
    </Modal>
  );
}
const modeLabel = (l, user) => (l.coach_id === user.id ? l.name : `Моя карточка · ${l.coach_name}`);
function Exercises({
  items,
  onChange,
  readonly = false,
  attachments = [],
  upload,
  removeFile,
  remaining = false,
}) {
  const update = (id, patch) => onChange(items.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const move = (index, delta) => {
    const copy = [...items];
    if (index + delta < 0 || index + delta >= copy.length) return;
    [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
    onChange(copy);
  };
  return (
    <div className="exercises">
      {items.map((e, i) =>
        remaining && (e.done || e.deleted) ? null : (
          <section key={e.id} className={`exercise ${e.deleted ? 'deleted' : ''}`}>
            <div className="exercise-head">
              <span className="exercise-index">{String(i + 1).padStart(2, '0')}</span>
              <input
                aria-label={`Название упражнения ${i + 1}`}
                value={e.title}
                onChange={(x) => update(e.id, { title: x.target.value })}
                disabled={e.deleted}
              />
              <span className="actor" title="Автор последней правки">
                {e.actor || 'т'}
              </span>
              <button
                className="icon-btn"
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Выше"
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                title="Ниже"
              >
                <ArrowDown size={15} />
              </button>
              <button
                className="icon-btn"
                type="button"
                onClick={() => update(e.id, { deleted: !e.deleted })}
                title={e.deleted ? 'Вернуть' : 'Перечеркнуть'}
              >
                {e.deleted ? <RefreshCw size={15} /> : <Trash2 size={15} />}
              </button>
            </div>
            {e.template_name && (
              <span className="template-label">
                Шаблон: {e.template_name}{' '}
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      items.map((x) =>
                        x.template_id === e.template_id ? { ...x, deleted: true } : x,
                      ),
                    )
                  }
                >
                  Убрать шаблон
                </button>
              </span>
            )}
            <input
              className="exercise-parameters"
              aria-label="Параметры упражнения"
              placeholder="Параметры, техника, отдых…"
              value={e.parameters}
              onChange={(x) => update(e.id, { parameters: x.target.value })}
              disabled={e.deleted}
            />
            {!e.deleted && (
              <>
                <div className="set-header">
                  <span>Подход</span>
                  <span>Вес, кг</span>
                  <span>Повторы</span>
                  <span>Дополнительно</span>
                  <span>Готово</span>
                </div>
                {e.sets.map((s, j) => (
                  <div className="set-row" key={s.id}>
                    <span>
                      {j + 1} <small className="actor">{s.actor}</small>
                    </span>
                    {['weight', 'reps', 'parameters'].map((k) => (
                      <input
                        key={k}
                        aria-label={`${k === 'weight' ? 'Вес' : k === 'reps' ? 'Повторы' : 'Параметры'} подхода ${j + 1}`}
                        inputMode={k === 'parameters' ? 'text' : 'decimal'}
                        value={s[k]}
                        onChange={(x) =>
                          update(e.id, {
                            sets: e.sets.map((v) =>
                              v.id === s.id ? { ...v, [k]: x.target.value } : v,
                            ),
                          })
                        }
                      />
                    ))}
                    <input
                      type="checkbox"
                      aria-label={`Подход ${j + 1} выполнен`}
                      checked={s.done}
                      onChange={(x) => {
                        const sets = e.sets.map((v) =>
                          v.id === s.id ? { ...v, done: x.target.checked } : v,
                        );
                        update(e.id, { sets, done: sets.every((s) => s.done) });
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      title="Поднять подход"
                      disabled={j === 0}
                      onClick={() => {
                        const sets = [...e.sets];
                        [sets[j - 1], sets[j]] = [sets[j], sets[j - 1]];
                        update(e.id, { sets });
                      }}
                    >
                      <ArrowUp size={13} />
                    </button>
                    {upload && (
                      <label className="icon-btn upload-btn" title="Файл к подходу">
                        <Plus size={15} />
                        <input
                          type="file"
                          hidden
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.docx"
                          onChange={(x) => {
                            if (x.target.files[0]) upload(x.target.files[0], e.id, s.id);
                            x.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-btn add-set"
                  onClick={() =>
                    update(e.id, {
                      sets: [
                        ...e.sets,
                        {
                          id: crypto.randomUUID(),
                          weight: '',
                          reps: '',
                          parameters: '',
                          done: false,
                        },
                      ],
                      done: false,
                    })
                  }
                >
                  <Plus size={14} />
                  Подход
                </button>
                <div className="exercise-bottom">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={e.done}
                      onChange={(x) =>
                        update(e.id, {
                          done: x.target.checked,
                          sets: e.sets.map((s) => ({ ...s, done: x.target.checked })),
                        })
                      }
                    />
                    Упражнение выполнено
                  </label>
                  {upload && (
                    <label className="text-btn upload-btn">
                      <Paperclip size={14} />
                      Прикрепить
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.docx"
                        onChange={(x) => {
                          if (x.target.files[0]) upload(x.target.files[0], e.id);
                          x.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </>
            )}
            <input
              className="exercise-comment"
              aria-label="Комментарий к упражнению"
              placeholder={
                e.deleted
                  ? 'Почему убрали упражнение?'
                  : 'Комментарий: самочувствие, что не получилось…'
              }
              value={e.comment}
              onChange={(x) => update(e.id, { comment: x.target.value })}
            />
            {attachments
              .filter((a) => a.exercise_id === e.id)
              .map((a) => (
                <div className="attachment" key={a.id}>
                  <a href={`/api/attachments/${a.id}`} download>
                    <Paperclip size={14} />
                    {a.filename}
                    {a.set_id ? ` · подход ${e.sets.findIndex((s) => s.id === a.set_id) + 1}` : ''}
                  </a>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeFile(a.id)}
                    aria-label="Удалить вложение"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </section>
        ),
      )}
      <button
        type="button"
        className="btn secondary full-width"
        onClick={() => onChange([...items, newExercise()])}
      >
        <Plus size={17} />
        Добавить упражнение вручную
      </button>
    </div>
  );
}
function TaskEditor({ modal, data, close, done, notify, reload }) {
  const detail = modal.type === 'task-detail',
    templateMode = modal.type === 'new-template';
  const [d, setD] = useState(null),
    [items, setItems] = useState(modal.template ? cloneTemplate(modal.template) : []),
    [remaining, setRemaining] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [working, setWorking] = useState(false);
  const formRef = useRef();
  useEffect(() => {
    if (detail)
      api(`/tasks/${modal.id}`)
        .then((t) => {
          setD(t);
          setItems(t.exercises);
        })
        .catch((e) => setError(e.message));
  }, [modal.id]);
  const refresh = async () => {
    const t = await api(`/tasks/${modal.id}`);
    setD(t);
  };
  const changeItems = (items) => {
    setItems(items);
    setDirty(true);
  };
  const save = async (b) => {
    if (templateMode) {
      await api('/templates', { name: b.title, kind: 'task', data: items });
      done('Шаблон сохранён');
      return;
    }
    const body = {
      title: b.title,
      description: b.description || '',
      kind: b.kind,
      due_at: new Date(b.due_at).toISOString(),
      location: b.location || '',
      status: b.status || 'todo',
      exercises: items,
      version: d?.version,
    };
    if (detail) {
      const next = await api(`/tasks/${modal.id}`, body, 'PUT');
      setD({ ...d, ...next });
      setItems(next.exercises);
      setDirty(false);
      notify('Тренировка сохранена');
      await reload();
    } else {
      const scope = b.scope || '';
      const [type, id] = scope.split(':');
      await api('/tasks', {
        ...body,
        link_id: type === 'link' ? id : undefined,
        group_id: type === 'group' ? id : undefined,
      });
      done('Тренировка назначена');
    }
  };
  const upload = async (file, exercise_id, set_id) => {
    try {
      if (dirty) throw new Error('Сначала сохраните изменения тренировки');
      setWorking(true);
      const body = new FormData();
      body.append('file', file);
      if (exercise_id) body.append('exercise_id', exercise_id);
      if (set_id) body.append('set_id', set_id);
      await api(`/tasks/${modal.id}/attachments`, body);
      await refresh();
      notify('Файл прикреплён');
    } catch (e) {
      notify(e.message);
    } finally {
      setWorking(false);
    }
  };
  const removeFile = async (id) => {
    try {
      if (
        !confirm(
          id
            ? 'Удалить выбранный файл?'
            : 'Удалить все файлы этой тренировки, упражнений и подходов?',
        )
      )
        return;
      await api(id ? `/attachments/${id}` : `/tasks/${modal.id}/attachments`, {}, 'DELETE');
      await refresh();
      notify('Файл удалён');
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <Modal
      title={detail ? 'Тренировка' : templateMode ? 'Новый шаблон' : 'Новая тренировка'}
      subtitle={
        detail
          ? d
            ? `${d.link.name} · ${d.kind === 'in_person' ? 'Очно' : 'Онлайн'} · версия ${d.version}`
            : 'Загружаем…'
          : 'Упражнения, подходы и параметры — под вашу задачу.'
      }
      close={() => {
        if (dirty) {
          if (confirm('Есть несохранённые изменения. Закрыть без сохранения?')) close();
        } else close();
      }}
      wide
    >
      {error && <div className="alert">{error}</div>}
      {(!detail || d) && (
        <Form
          submit={
            detail
              ? 'Сохранить тренировку'
              : templateMode
                ? 'Сохранить шаблон'
                : 'Назначить тренировку'
          }
          onSubmit={save}
        >
          <div onChange={() => setDirty(true)}>
            {!detail && !templateMode && (
              <Field label="Кому назначить">
                <select
                  name="scope"
                  required
                  defaultValue={
                    modal.group_id
                      ? `group:${modal.group_id}`
                      : `link:${modal.link_id || data.links.find((l) => !l.archived)?.id || ''}`
                  }
                >
                  <option value="">Выберите человека или группу</option>
                  {data.links
                    .filter((l) => !l.archived)
                    .map((l) => (
                      <option key={l.id} value={`link:${l.id}`}>
                        {l.name}
                      </option>
                    ))}
                  {data.groups
                    .filter((g) => !g.archived)
                    .map((g) => (
                      <option key={g.id} value={`group:${g.id}`}>
                        Группа: {g.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field
              label="Название"
              name="title"
              required
              defaultValue={d?.title || modal.template?.name}
              placeholder="Силовая · всё тело"
            />
            {!templateMode && (
              <>
                <div className="form-row">
                  <Field label="Тип тренировки">
                    <select name="kind" defaultValue={d?.kind || 'in_person'}>
                      <option value="in_person">Очно</option>
                      <option value="online">Онлайн</option>
                    </select>
                  </Field>
                  <Field
                    label="Дата и время"
                    name="due_at"
                    type="datetime-local"
                    required
                    defaultValue={dt(d?.due_at || new Date(Date.now() + 86400000))}
                  />
                </div>
                <Field
                  label="Место (для очной тренировки)"
                  name="location"
                  defaultValue={d?.location}
                />
                <Field label="Описание (необязательно)">
                  <textarea name="description" defaultValue={d?.description} rows="2" />
                </Field>
                {detail && (
                  <Field label="Статус">
                    <select name="status" defaultValue={d.status}>
                      <option value="todo">Не начата</option>
                      <option value="doing">Выполняется</option>
                      <option value="done">Выполнена</option>
                    </select>
                  </Field>
                )}
              </>
            )}
          </div>
          <div className="exercise-toolbar">
            <h3>
              Упражнения <small>{items.filter((e) => !e.deleted).length}</small>
            </h3>
            {detail && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remaining}
                  onChange={(e) => setRemaining(e.target.checked)}
                />
                Осталось сделать
              </label>
            )}
            {!templateMode && (
              <select
                aria-label="Добавить шаблон"
                value=""
                onChange={(e) => {
                  const t = data.templates.find((t) => t.id === e.target.value);
                  if (t) changeItems([...items, ...cloneTemplate(t)]);
                }}
              >
                <option value="">+ Из шаблона</option>
                {data.templates
                  .filter((t) => t.kind === 'task')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
          <Exercises
            {...{ items, remaining, removeFile }}
            onChange={changeItems}
            attachments={d?.attachments || []}
            upload={detail ? upload : null}
          />
          {detail && (
            <div className="task-files">
              <h3>Файл к тренировке</h3>
              {d.attachments?.length > 0 && (
                <button className="text-btn danger" type="button" onClick={() => removeFile(null)}>
                  Удалить все вложения ({d.attachments.length})
                </button>
              )}
              {d.attachments
                ?.filter((a) => !a.exercise_id)
                .map((a) => (
                  <div className="attachment" key={a.id}>
                    <a href={`/api/attachments/${a.id}`} download>
                      <Paperclip size={15} />
                      {a.filename}
                    </a>
                    <button type="button" className="icon-btn" onClick={() => removeFile(a.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              {!d.attachments?.some((a) => !a.exercise_id) && (
                <label className="btn secondary upload-btn">
                  <Plus size={15} />
                  {working ? 'Загружаем…' : 'Загрузить файл'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.docx"
                    onChange={(e) => {
                      if (e.target.files[0]) upload(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <p className="form-hint">
                До 25 МБ. JPG, PNG, WebP, MP4, WebM, PDF, DOCX. Изменения упражнений сохраните до
                загрузки файла.
              </p>
            </div>
          )}
          {dirty && <p className="unsaved">Есть несохранённые изменения</p>}
        </Form>
      )}
      {detail && d && (
        <div className="important-comments">
          <h3>Важный комментарий</h3>
          <div className="quick-comments">
            {['Задержусь', 'Не смогу', 'Отмена', 'Сделал раньше и загрузил отчёт'].map((body) => (
              <button
                key={body}
                className="btn secondary"
                onClick={async () => {
                  try {
                    await api(`/tasks/${d.id}/comments`, { body });
                    await refresh();
                    notify('Комментарий добавлен');
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                {body}
              </button>
            ))}
          </div>
          <Form
            submit="Добавить комментарий"
            onSubmit={async (b) => {
              await api(`/tasks/${d.id}/comments`, b);
              await refresh();
              notify('Комментарий добавлен');
            }}
          >
            <Field label="Свой текст" name="body" required />
          </Form>
          {d.comments?.map((c) => (
            <div className="comment" key={c.id}>
              <b>{c.author_name}</b>
              <small>{date(c.created_at)}</small>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
function cloneTemplate(t) {
  const instance = crypto.randomUUID();
  return t.data.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    template_id: instance,
    template_name: t.name,
    done: false,
    deleted: false,
    sets: e.sets.map((s) => ({ ...s, id: crypto.randomUUID(), done: false })),
  }));
}

function SummaryForm({ modal, data, mode, close, done }) {
  const [link, setLink] = useState(modal.id || data.links.find((l) => !l.archived)?.id || ''),
    [metrics, setMetrics] = useState([]);
  useEffect(() => {
    if (link)
      api(`/cards/${link}`)
        .then((c) => setMetrics(c.metrics))
        .catch(() => setMetrics([]));
  }, [link]);
  return (
    <Modal title="Подготовить сводку" close={close}>
      <Form
        submit="Собрать сводку"
        onSubmit={async (b, form) => {
          await api(`/cards/${link}/summaries`, {
            start: new Date(b.start).toISOString(),
            end: new Date(b.end).toISOString(),
            metric_ids: metrics
              .filter((m) => form.elements[`metric-${m.id}`]?.checked)
              .map((m) => m.id),
          });
          done(
            mode === 'coach' ? 'Сводка готова к проверке' : 'Сводка отправлена тренеру на проверку',
          );
        }}
      >
        <Field label="Карточка">
          <select value={link} onChange={(e) => setLink(e.target.value)}>
            {data.links
              .filter((l) => !l.archived || l.id === modal.id)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-row">
          <Field
            label="Начало периода"
            type="datetime-local"
            name="start"
            required
            defaultValue={dt(new Date(Date.now() - 7 * 86400000))}
          />
          <Field
            label="Конец (не включительно)"
            type="datetime-local"
            name="end"
            required
            defaultValue={dt(new Date())}
          />
        </div>
        <p className="form-hint">
          Показатели для сводки. Если ни один не выбран, будут включены все доступные подопечному
          показатели.
        </p>
        {metrics.map((m) => (
          <label className="checkbox" key={m.id}>
            <input type="checkbox" name={`metric-${m.id}`} defaultChecked />
            {m.name} · {m.unit}
          </label>
        ))}
        <p className="form-hint">
          Перед отправкой тренер проверяет сводку. Скрытые показатели в обратную связь не попадают.
        </p>
      </Form>
    </Modal>
  );
}

function Scanner({ close, notify, data }) {
  const video = useRef(),
    stream = useRef(),
    timer = useRef(),
    [result, setResult] = useState(''),
    [error, setError] = useState('');
  useEffect(
    () => () => {
      clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  const scan = async () => {
    try {
      const detector =
        'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      video.current.srcObject = stream.current;
      await video.current.play();
      timer.current = setInterval(async () => {
        let raw;
        if (detector) {
          raw = (await detector.detect(video.current))[0]?.rawValue;
        } else if (video.current.videoWidth) {
          canvas.width = video.current.videoWidth;
          canvas.height = video.current.videoHeight;
          context.drawImage(video.current, 0, 0);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          raw = jsQR(image.data, image.width, image.height)?.data;
        }
        if (raw) {
          setResult(raw);
          clearInterval(timer.current);
          stream.current.getTracks().forEach((t) => t.stop());
        }
      }, 400);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Сканировать QR-код" close={close}>
      <video ref={video} className="scanner" playsInline muted />
      {error && <div className="alert">{error}</div>}
      <button className="btn secondary" onClick={scan}>
        <ScanLine size={18} />
        Включить камеру
      </button>
      <Form
        submit="Создать приглашение по ID"
        onSubmit={async (b) => {
          await api('/invitations', { public_id: b.public_id, group_id: b.group_id || null });
          notify('Приглашение отправлено. Подопечный подтвердит его у себя.');
          close();
        }}
      >
        <Field
          label="Распознанный ID или ручной ввод"
          name="public_id"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          required
        />
        <Field label="Добавить в группу">
          <select name="group_id">
            <option value="">Без группы</option>
            {data.groups
              .filter((g) => !g.archived)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
      </Form>
    </Modal>
  );
}
createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && !import.meta.env.DEV)
  navigator.serviceWorker.register('/sw.js').catch(() => {});
