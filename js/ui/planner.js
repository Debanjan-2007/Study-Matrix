// ui/planner.js — weekly matrix: plan blocks, manage subjects/topics.

import { store, uid, colorHex, SUBJECT_COLORS, setPlan, planFor, sessionsFor, demoState } from '../store.js';
import { dateKey, weekBounds, addDaysKey, weekdayShort, dayNum, fmtDateNice } from '../stats.js';
import { openModal, toast, field, el } from './common.js';

let weekOffset = 0; // 0 = current week, +/- n weeks
let popover = null;

export function initPlanner() {
  document.getElementById('week-prev').addEventListener('click', () => { weekOffset--; renderPlanner(); });
  document.getElementById('week-next').addEventListener('click', () => { weekOffset++; renderPlanner(); });
  document.getElementById('week-today').addEventListener('click', () => { weekOffset = 0; renderPlanner(); });
  document.getElementById('add-subject').addEventListener('click', () => openSubjectModal());
  document.addEventListener('click', e => {
    if (popover && !popover.contains(e.target) && !e.target.closest('.cell')) closePopover();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && popover) closePopover();
  });
}

function anchorKey() {
  return addDaysKey(dateKey(), weekOffset * 7);
}

function closePopover() {
  popover?.remove();
  popover = null;
}

export function renderPlanner() {
  const root = document.getElementById('planner-root');
  const state = store.state;
  const anchor = anchorKey();
  const { monday, sunday } = weekBounds(anchor);
  const todayKey = dateKey();

  // Week label
  const label = document.getElementById('week-label');
  const range = document.getElementById('week-range');
  if (weekOffset === 0) label.textContent = 'This week';
  else if (weekOffset === -1) label.textContent = 'Last week';
  else if (weekOffset === 1) label.textContent = 'Next week';
  else label.textContent = (weekOffset > 0 ? '+' : '') + weekOffset + ' weeks';
  range.textContent = fmtDateNice(monday) + ' – ' + fmtDateNice(sunday);

  closePopover();

  if (state.subjects.length === 0) {
    root.innerHTML = '';
    const empty = el('div', 'empty');
    empty.appendChild(artIcon());
    const h = el('h3', null, 'Your matrix is a blank page');
    const p = el('p', null, 'Add a subject and a topic, drop a few blocks on the week, then start a focus session — every finished session fills a dot automatically.');
    const row = el('div', 'row');
    const add = el('button', 'btn btn-primary', 'Add your first subject');
    add.addEventListener('click', () => openSubjectModal());
    const demo = el('button', 'btn btn-ghost', 'Explore with demo data');
    demo.addEventListener('click', loadDemo);
    row.append(add, demo);
    empty.append(h, p, row);
    root.appendChild(empty);
    return;
  }

  const scroll = el('div', 'matrix-scroll');
  const table = document.createElement('table');
  table.className = 'matrix';

  // --- header ---
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'corner-col';
  corner.textContent = 'Topic';
  hr.appendChild(corner);
  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(monday, i);
    const th = document.createElement('th');
    if (key === todayKey) th.classList.add('is-today');
    th.innerHTML = `<span>${weekdayShort(key)}</span><span class="daynum">${dayNum(key)}</span>`;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  // --- body ---
  const tbody = document.createElement('tbody');
  for (const subject of state.subjects) {
    const topics = state.topics.filter(t => t.subjectId === subject.id && !t.archived);

    const sRow = document.createElement('tr');
    sRow.className = 'subject-row';
    const sCell = document.createElement('td');
    sCell.colSpan = 8;
    const tag = el('span', 'subject-tag');
    tag.style.setProperty('--c', colorHex(subject.color));
    tag.innerHTML = `<span class="swatch"></span>`;
    tag.appendChild(document.createTextNode(subject.name));
    const tools = el('span', 'subject-tools');
    tools.appendChild(toolButton('Add topic', 'M12 5v14M5 12h14', () => openTopicModal(subject.id)));
    tools.appendChild(toolButton('Edit subject', 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM13.5 6.5l3 3', () => openSubjectModal(subject)));
    tools.appendChild(toolButton('Delete subject', 'M5 7h14M10 7V5h4v2m-6 0 1 13h6l1-13', () => deleteSubject(subject)));
    tag.appendChild(tools);
    sCell.appendChild(tag);
    if (topics.length === 0) {
      const hint = el('span', 'subject-hint');
      const addFirst = el('button', 'link-btn', 'Add your first topic');
      addFirst.addEventListener('click', () => openTopicModal(subject.id));
      hint.appendChild(document.createTextNode('No topics yet — '));
      hint.appendChild(addFirst);
      hint.appendChild(document.createTextNode(' to plan blocks.'));
      sCell.appendChild(hint);
    }
    sRow.appendChild(sCell);
    tbody.appendChild(sRow);

    for (const topic of topics) {
      tbody.appendChild(topicRow(state, subject, topic, monday, todayKey));
    }
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  root.innerHTML = '';
  root.appendChild(scroll);
}

function topicRow(state, subject, topic, monday, todayKey) {
  const tr = document.createElement('tr');
  const hex = colorHex(subject.color);

  const nameTd = document.createElement('td');
  nameTd.className = 'topic-col';
  const name = el('div', 'topic-name' + (topic.done ? ' is-done' : '') + (isOverdue(topic, todayKey) ? ' is-overdue' : ''));
  name.appendChild(document.createTextNode(topic.title));
  const est = el('span', 'est', '~' + topic.estBlocks + ' blk');
  name.appendChild(est);
  if (isOverdue(topic, todayKey)) name.appendChild(el('span', 'overdue-tag', 'overdue'));
  nameTd.appendChild(name);

  const sub = el('div', 'topic-sub');
  const start = document.createElement('button');
  start.className = 'row-start';
  start.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><path d="M7 4.8v14.4L19 12Z" fill="currentColor"/></svg> Start`;
  start.title = 'Focus on ' + topic.title;
  start.addEventListener('click', () => {
    store.update(s => { s.timer.topicId = topic.id; });
    document.dispatchEvent(new CustomEvent('app:navigate', { detail: 'focus' }));
  });
  sub.appendChild(start);

  // Progress: completed blocks (all time) vs estimated, with this week's plan layered on top.
  const done = state.sessions.filter(s => s.topicId === topic.id).length;
  const estN = Math.max(1, topic.estBlocks || 1);
  let plannedWeek = 0;
  for (let i = 0; i < 7; i++) plannedWeek += planFor(state, topic.id, addDaysKey(monday, i));
  const pctDone = Math.min(100, (done / estN) * 100);
  const pctPlanned = Math.max(0, Math.min(100 - pctDone, (plannedWeek / estN) * 100));
  const over = done + plannedWeek > estN;
  const prog = el('div', 'tpbar' + (over ? ' is-over' : ''));
  prog.style.setProperty('--c', hex);
  prog.title = `${done} of ${estN} blocks completed · ${plannedWeek} planned this week`;
  prog.innerHTML = `<div class="tpbar-track"><div class="tpbar-done" style="width:${pctDone}%"></div><div class="tpbar-planned" style="width:${pctPlanned}%"></div></div><span class="tpbar-text">${done}/${estN}${over ? '+' : ''}</span>`;
  sub.appendChild(prog);

  const edit = document.createElement('button');
  edit.className = 'tool-btn';
  edit.title = 'Edit topic';
  edit.innerHTML = '<svg viewBox="0 0 24 24" class="ic"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM13.5 6.5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  edit.addEventListener('click', () => openTopicModal(subject.id, topic));
  sub.appendChild(edit);
  nameTd.appendChild(sub);
  tr.appendChild(nameTd);

  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(monday, i);
    const td = document.createElement('td');
    td.className = 'cell';
    td.style.setProperty('--c', hex);
    td.dataset.topic = topic.id;
    td.dataset.date = key;
    td.appendChild(cellDots(state, topic.id, key, hex));
    td.addEventListener('click', e => openStepper(e.currentTarget, subject, topic, key));
    tr.appendChild(td);
  }
  return tr;
}

function cellDots(state, topicId, key, hex) {
  const planned = planFor(state, topicId, key);
  const done = sessionsFor(state, topicId, key).length;
  const wrap = el('div', 'dots');
  wrap.style.setProperty('--c', hex);
  const filled = Math.min(planned, done);
  const open = Math.max(0, planned - done);
  const over = Math.max(0, done - planned);
  for (let i = 0; i < filled; i++) wrap.appendChild(el('span', 'dot is-done'));
  for (let i = 0; i < open; i++) wrap.appendChild(el('span', 'dot is-planned'));
  for (let i = 0; i < over; i++) wrap.appendChild(el('span', 'dot is-over'));
  if (done > 0) wrap.appendChild(el('span', 'cell-sum', String(done)));
  return wrap;
}

// Animate the dot that just filled (called from focus.js after auto-log).
export function animateLastDot(topicId, dateKeyStr) {
  if (weekOffset !== 0) return;
  renderPlanner();
  const cell = document.querySelector(`#planner-root .cell[data-topic="${topicId}"][data-date="${dateKeyStr}"]`);
  const doneDots = cell?.querySelectorAll('.dot.is-done');
  const last = doneDots?.[doneDots.length - 1];
  if (last) last.classList.add('pop');
}

function openStepper(cellEl, subject, topic, key) {
  closePopover();
  const state = store.state;
  const hex = colorHex(subject.color);
  let value = planFor(state, topic.id, key);

  const pop = el('div', 'popover');
  const title = el('div', 'popover-title', topic.title);
  const sub = el('div', 'popover-sub', weekdayLongLocal(key) + ' · planned focus blocks');
  const step = el('div', 'stepper');
  const minus = el('button', null, '−');
  const val = el('div', 'step-val', String(value));
  const plus = el('button', null, '+');
  const apply = el('button', 'btn btn-primary', 'Set plan');
  minus.setAttribute('aria-label', 'Fewer blocks');
  plus.setAttribute('aria-label', 'More blocks');
  minus.addEventListener('click', () => { value = Math.max(0, value - 1); val.textContent = value; });
  plus.addEventListener('click', () => { value = Math.min(12, value + 1); val.textContent = value; });
  apply.addEventListener('click', () => {
    store.update(s => setPlan(s, topic.id, key, value));
    closePopover();
  });
  step.append(minus, val, plus);
  pop.append(title, sub, step, apply);
  popover = pop;
  document.body.appendChild(pop);

  const r = cellEl.getBoundingClientRect();
  const pw = 230, ph = pop.offsetHeight || 210;
  let left = Math.min(r.left, window.innerWidth - pw - 12);
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 10) top = r.top - ph - 8;
  pop.style.left = Math.max(10, left) + 'px';
  pop.style.top = Math.max(10, top) + 'px';
}

function weekdayLongLocal(key) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(key + 'T12:00:00').getDay()];
}

function isOverdue(topic, todayKey) {
  return !!topic.dueDate && topic.dueDate < todayKey;
}

function toolButton(title, pathD, onClick) {
  const b = document.createElement('button');
  b.className = 'tool-btn';
  b.title = title;
  b.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><path d="${pathD}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

function artIcon() {
  const wrap = el('div', 'empty-art');
  wrap.innerHTML = '<svg viewBox="0 0 24 24" class="ic"><circle cx="7" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="7" r="2.6" fill="currentColor" opacity=".9"/><circle cx="7" cy="17" r="2.6" fill="currentColor" opacity=".9"/><rect x="14.8" y="14.8" width="4.4" height="4.4" rx="1.2" fill="currentColor" transform="rotate(45 17 17)"/></svg>';
  return wrap;
}

// ---------- subject & topic modals ----------

function openSubjectModal(existing) {
  const body = el('div');
  const name = el('input', 'input');
  name.id = 'subject-name';
  name.placeholder = 'e.g. Mathematics';
  name.maxLength = 40;
  name.value = existing?.name || '';
  body.appendChild(field('Subject name', name));

  const colors = el('div', 'color-dots');
  let picked = existing?.color || SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)].id;
  for (const c of SUBJECT_COLORS) {
    const b = el('button', 'color-dot-pick' + (c.id === picked ? ' is-picked' : ''));
    b.type = 'button';
    b.style.setProperty('--c', c.hex);
    b.title = c.id;
    b.setAttribute('aria-label', 'Color ' + c.id);
    b.addEventListener('click', () => {
      picked = c.id;
      colors.querySelectorAll('.color-dot-pick').forEach(x => x.classList.remove('is-picked'));
      b.classList.add('is-picked');
    });
    colors.appendChild(b);
  }
  body.appendChild(field('Colour', colors));

  openModal({
    title: existing ? 'Edit subject' : 'New subject',
    sub: 'Subjects group your topics by area of study.',
    body,
    actions: [
      { label: 'Cancel' },
      {
        label: existing ? 'Save' : 'Add subject', kind: 'primary',
        onClick: () => {
          const v = name.value.trim();
          if (!v) return false;
          if (existing) {
            store.update(s => {
              const sub = s.subjects.find(x => x.id === existing.id);
              if (sub) { sub.name = v; sub.color = picked; }
            });
          } else {
            const id = uid('s');
            store.update(s => {
              s.subjects.push({ id, name: v, color: picked });
            });
            openTopicModal(id);
          }
        },
      },
    ],
  });
  setTimeout(() => name.focus(), 40);
}

function deleteSubject(subject) {
  const topicCount = store.state.topics.filter(t => t.subjectId === subject.id).length;
  const p = el('p', 'modal-sub');
  p.textContent = `This deletes "${subject.name}"${topicCount ? ` and its ${topicCount} topic${topicCount > 1 ? 's' : ''}` : ''}. Past sessions stay in your history. This cannot be undone.`;
  openModal({
    title: 'Delete subject?',
    body: p,
    actions: [
      { label: 'Cancel', kind: 'primary' },
      {
        label: 'Delete', kind: 'danger',
        onClick: () => {
          store.update(s => {
            const tids = s.topics.filter(t => t.subjectId === subject.id).map(t => t.id);
            s.subjects = s.subjects.filter(x => x.id !== subject.id);
            s.topics = s.topics.filter(t => t.subjectId !== subject.id);
            s.plan = s.plan.filter(pl => !tids.includes(pl.topicId));
          });
        },
      },
    ],
  });
}

function openTopicModal(subjectId, existing) {
  const subject = store.state.subjects.find(s => s.id === subjectId);
  const body = el('div');
  const title = el('input', 'input');
  title.id = 'topic-title';
  title.placeholder = 'e.g. Process scheduling';
  title.maxLength = 60;
  title.value = existing?.title || '';
  body.appendChild(field('Topic', title));

  const row = el('div', 'field-row');
  const blocksWrap = el('div', 'field');
  const blocksLabel = el('label', 'field-label', 'Estimated blocks');
  blocksLabel.htmlFor = 'topic-blocks';
  const blocks = el('input', 'input');
  blocks.id = 'topic-blocks';
  blocks.type = 'number';
  blocks.min = 1;
  blocks.max = 20;
  blocks.value = existing?.estBlocks ?? 4;
  blocksWrap.append(blocksLabel, blocks);
  const dueWrap = el('div', 'field');
  const dueLabel = el('label', 'field-label', 'Due date (optional)');
  dueLabel.htmlFor = 'topic-due';
  const due = el('input', 'input');
  due.id = 'topic-due';
  due.type = 'date';
  due.value = existing?.dueDate || '';
  dueWrap.append(dueLabel, due);
  row.append(blocksWrap, dueWrap);
  body.appendChild(row);

  openModal({
    title: existing ? 'Edit topic' : `New topic — ${subject?.name || ''}`,
    sub: 'One block equals one focus session.',
    body,
    actions: [
      ...(existing ? [{ label: existing.done ? 'Mark as active' : 'Mark done', left: true, onClick: () => { store.update(s => { const t = s.topics.find(x => x.id === existing.id); if (t) t.done = !t.done; }); } }] : []),
      { label: 'Cancel' },
      {
        label: existing ? 'Save' : 'Add topic', kind: 'primary',
        onClick: () => {
          const v = title.value.trim();
          if (!v) return false;
          const n = Math.min(20, Math.max(1, parseInt(blocks.value, 10) || 1));
          store.update(s => {
            if (existing) {
              const t = s.topics.find(x => x.id === existing.id);
              if (t) { t.title = v; t.estBlocks = n; t.dueDate = due.value || null; }
            } else {
              s.topics.push({ id: uid('t'), subjectId, title: v, estBlocks: n, dueDate: due.value || null, done: false, archived: false });
            }
          });
        },
      },
    ],
  });
  setTimeout(() => title.focus(), 40);
}

function loadDemo() {
  store.update(s => { Object.assign(s, demoState()); });
  toast('Demo workspace loaded — make it yours from Settings → Data.', { actionLabel: 'Got it' });
}
