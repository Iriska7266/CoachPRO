import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Minus, Plus, LoaderCircle } from 'lucide-react';
export const date = (v, opts = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('ru-RU', opts).format(new Date(v));
export const dt = (v) =>
  new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export const initials = (name) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
export function Avatar({ name, size = '' }) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ '--avatar-hue': ((name.charCodeAt(0) * 17) % 100) + 130 }}
    >
      {initials(name)}
    </span>
  );
}
export function Trend({ value = 'unknown' }) {
  const [label, Icon] = {
    up: ['Растёт', ArrowUpRight],
    flat: ['Стоит', Minus],
    down: ['Падает', ArrowDownRight],
    unknown: ['Мало данных', Minus],
  }[value] || ['Мало данных', Minus];
  return (
    <span className={`trend ${value}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}
export function Status({ task }) {
  const status =
    task.status === 'done' ? 'done' : new Date(task.due_at) < new Date() ? 'overdue' : task.status;
  return (
    <span className={`status ${status}`}>
      {
        { done: 'Выполнена', overdue: 'Просрочена', todo: 'Запланирована', doing: 'В процессе' }[
          status
        ]
      }
    </span>
  );
}
export function Empty({ title = 'Здесь пока пусто', text, action }) {
  return (
    <div className="empty">
      <span className="empty-mark">↗</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({ title, subtitle, children, close, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'wide' : ''}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" type="button" onClick={close} aria-label="Закрыть">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Form({ children, onSubmit, submit = 'Сохранить', className = '' }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className={`form ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          await onSubmit(Object.fromEntries(new FormData(e.currentTarget)), e.currentTarget);
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button className="btn primary" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : null}
        {submit}
      </button>
    </form>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Chart({ entries, metric, height = 210 }) {
  const rows = entries
    .filter((e) => !e.deleted_at && e.metric_id === metric?.id)
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
  if (rows.length < 2)
    return (
      <Empty
        title="Для графика нужны две записи"
        text="Добавьте результат — здесь появится динамика."
      />
    );
  const vals = rows.map((r) => Number(r.value));
  const min = Math.min(...vals),
    max = Math.max(...vals),
    pad = (max - min) * 0.2 || 1;
  const lo = min - pad,
    hi = max + pad;
  const times = rows.map((r) => +new Date(r.measured_at));
  const span = times.at(-1) - times[0];
  const X = (i) => 52 + (span ? (times[i] - times[0]) / span : i / (vals.length - 1)) * 596,
    Y = (v) => height - 34 - ((v - lo) / (hi - lo)) * (height - 62);
  const line = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  return (
    <svg
      className="chart"
      viewBox={`0 0 680 ${height}`}
      role="img"
      aria-label={`График ${metric.name}: ${vals[0]} — ${vals.at(-1)} ${metric.unit}`}
    >
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1b8c72" stopOpacity=".16" />
          <stop offset="1" stopColor="#1b8c72" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => {
        const v = lo + ((hi - lo) * i) / 3;
        return (
          <g key={i}>
            <line x1="52" x2="648" y1={Y(v)} y2={Y(v)} stroke="#e9edeb" strokeDasharray="4 4" />
            <text x="0" y={Y(v) + 4} fill="#84918b" fontSize="11">
              {v.toFixed(1)}
            </text>
          </g>
        );
      })}
      <polygon points={`52,${height - 34} ${line} 648,${height - 34}`} fill="url(#chart-fill)" />
      <polyline points={line} fill="none" stroke="#21896f" strokeWidth="3" strokeLinejoin="round" />
      {vals.map((v, i) => (
        <circle key={i} cx={X(i)} cy={Y(v)} r="4" fill="white" stroke="#21896f" strokeWidth="2">
          <title>
            {date(rows[i].measured_at)}: {v} {metric.unit}
          </title>
        </circle>
      ))}
      <text x="52" y={height - 5} fill="#84918b" fontSize="11">
        {date(rows[0].measured_at)}
      </text>
      <text x="648" textAnchor="end" y={height - 5} fill="#84918b" fontSize="11">
        {date(rows.at(-1).measured_at)}
      </text>
    </svg>
  );
}
export function Counter({ value, onChange }) {
  return (
    <div className="counter">
      <button
        type="button"
        onClick={() => onChange(String(Math.round((Number(value) - 1) * 100) / 100))}
        aria-label="Уменьшить на один"
      >
        <Minus />
      </button>
      <input
        type="number"
        step="any"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Значение результата"
      />
      <button
        type="button"
        onClick={() => onChange(String(Math.round((Number(value) + 1) * 100) / 100))}
        aria-label="Увеличить на один"
      >
        <Plus />
      </button>
    </div>
  );
}
