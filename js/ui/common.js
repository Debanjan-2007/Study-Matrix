// ui/common.js — toast + modal helpers shared by screens.

export function toast(message, { actionLabel, onAction, timeoutMs = 10000 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  let bar = null;
  if (timeoutMs) {
    bar = document.createElement('div');
    bar.className = 'toast-bar';
    bar.style.animationDuration = timeoutMs + 'ms';
    el.appendChild(bar);
  }
  let done = false;
  const finish = () => { if (!done) { done = true; el.remove(); } };
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { onAction?.(); finish(); });
    el.appendChild(btn);
  }
  root.appendChild(el);
  if (timeoutMs) setTimeout(finish, timeoutMs);
  return finish;
}

export function openModal({ title, sub, body, actions = [], onClose }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title);

  const h = document.createElement('h2');
  h.textContent = title;
  modal.appendChild(h);
  if (sub) {
    const p = document.createElement('p');
    p.className = 'modal-sub';
    p.textContent = sub;
    modal.appendChild(p);
  }
  const bodyWrap = document.createElement('div');
  if (body) bodyWrap.appendChild(body);
  modal.appendChild(bodyWrap);

  const footer = document.createElement('div');
  footer.className = 'modal-actions';
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.kind ? 'btn-' + a.kind : 'btn-ghost');
    btn.textContent = a.label;
    if (a.classes) btn.classList.add(...a.classes);
    btn.addEventListener('click', () => { const keep = a.onClick?.(); if (keep !== false) close(); });
    if (a.left) { btn.classList.add('left'); footer.prepend(btn); } else footer.appendChild(btn);
  }
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc);
  root.appendChild(backdrop);
  const first = modal.querySelector('input, select, button.btn-primary') || modal.querySelector('button');
  setTimeout(() => first?.focus(), 30);
  return { close, modal };
}

export function field(labelText, input) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = labelText;
  if (input.id) label.htmlFor = input.id;
  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
