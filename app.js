/* Site Snag — offline site survey & snagging PWA. No build step, no sign-in. */
'use strict';
(() => {

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const isOverdue = it => it.dueDate && it.status !== 'Complete' && it.dueDate < today();

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  clip: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  arrow: '<path d="M5 19L19 5M19 5h-8M19 5v8"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  circle: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function busy(msg) {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = `<div><span class="spinner"></span><span>${esc(msg)}</span></div>`;
  document.body.appendChild(el);
  return () => el.remove();
}

// ---------------------------------------------------------------- storage (IndexedDB)
let dbPromise;
function openDb() {
  return dbPromise ||= new Promise((res, rej) => {
    const r = indexedDB.open('site-snag', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('surveys', { keyPath: 'id' });
      db.createObjectStore('items', { keyPath: 'id' }).createIndex('surveyId', 'surveyId');
      db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run(storeName, mode, fn) {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(storeName, mode);
    const out = fn(tx.objectStore(storeName));
    tx.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Storage transaction aborted'));
  }));
}
const DB = {
  get: (s, k) => run(s, 'readonly', st => st.get(k)),
  all: s => run(s, 'readonly', st => st.getAll()),
  put: (s, v, k) => run(s, 'readwrite', st => (k === undefined ? st.put(v) : st.put(v, k))),
  del: (s, k) => run(s, 'readwrite', st => st.delete(k)),
  byIndex: (s, i, v) => run(s, 'readonly', st => st.index(i).getAll(v)),
};
const DEFAULT_PEOPLE = ['Main Contractor', 'Electrician', 'Plumber', 'Joiner', 'Decorator', 'Client'];
const DEFAULT_SURVEYORS = ['Paul Bonner', 'Paul Heaton', 'Kass Weetman', 'Alex Slattery', 'Mike Slattery', 'Stuart Clements'];
const DEFAULT_DISCIPLINES = ['HVAC', 'Plumbing', 'Pipework', 'CAD', 'Engineering'];
const DEFAULT_COMPANY = 'adi Climate Systems Limited';
const Settings = {
  async get(k, def) { const v = await DB.get('kv', k); return v === undefined ? def : v; },
  set: (k, v) => DB.put('kv', v, k),
  people() { return this.get('people', DEFAULT_PEOPLE); },
  surveyors() { return this.get('surveyors', DEFAULT_SURVEYORS); },
  disciplines() { return this.get('disciplines', DEFAULT_DISCIPLINES); },
  company() { return this.get('company', DEFAULT_COMPANY); },
};
// One-off upgrade for devices that used the first version (company was blank then).
async function seedDefaults() {
  if ((await Settings.get('seed', 0)) >= 2) return;
  if (!(await Settings.get('company', ''))) await Settings.set('company', DEFAULT_COMPANY);
  await Settings.set('seed', 2);
}

// <select> with an "Add another…" option that prompts for a new name and remembers it.
const ADD = '__add__';
function listSelect(list, value, placeholder) {
  const opts = value && !list.includes(value) ? [...list, value] : list;
  return `<option value="">${esc(placeholder)}</option>`
    + opts.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')
    + `<option value="${ADD}">+ Add another…</option>`;
}
function bindListSelect(sel, settingsKey, getList, placeholder, onPick, promptText) {
  sel.addEventListener('change', async () => {
    let v = sel.value;
    if (v === ADD) {
      v = (prompt(promptText) || '').trim();
      const list = await getList();
      if (v && !list.includes(v)) await Settings.set(settingsKey, [...list, v]);
      sel.innerHTML = listSelect(await getList(), v || sel.dataset.last || '', placeholder);
      if (!v) return;
    }
    sel.dataset.last = v;
    onPick(v);
  });
}

// Row of one-tap chips (single choice) with "+ Add" that remembers new entries.
function bindChipPicker(el, { get, set, list, settingsKey, promptText, onChange }) {
  let items = list;
  const render = () => {
    const cur = get();
    const shown = !cur || items.includes(cur) ? items : [...items, cur];
    el.innerHTML = shown.map(p => `<button class="chip ${p === cur ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')
      + `<button class="chip add" data-add="1">+ Add</button>`;
  };
  render();
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) {
      const name = (prompt(promptText) || '').trim();
      if (!name) return;
      if (!items.includes(name)) { items = [...items, name]; await Settings.set(settingsKey, items); }
      set(name);
    } else {
      set(get() === b.dataset.p ? '' : b.dataset.p);
    }
    render(); onChange();
  };
}

async function getItems(surveyId) {
  const items = await DB.byIndex('items', 'surveyId', surveyId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}
async function touchSurvey(id) {
  const s = await DB.get('surveys', id);
  if (s) { s.updatedAt = Date.now(); await DB.put('surveys', s); }
}

// Debounced autosave; flushed before navigating away.
const pending = new Map();
function saveLater(key, fn, ms = 400) {
  clearTimeout(pending.get(key)?.t);
  pending.set(key, { fn, t: setTimeout(() => { pending.delete(key); fn(); }, ms) });
}
async function flushSaves() {
  const jobs = [...pending.values()];
  pending.clear();
  for (const j of jobs) { clearTimeout(j.t); await j.fn(); }
}

// ---------------------------------------------------------------- images
function blobToImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    img.src = url;
  });
}
const canvasToBlob = (c, type = 'image/jpeg', q = 0.86) => new Promise(res => c.toBlob(res, type, q));
const blobToDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob);
});
const dataURLToBlob = async d => (await fetch(d)).blob();

// Shrink camera photos so storage and PDFs stay small (EXIF rotation is applied by the browser).
async function processPhoto(file) {
  const img = await blobToImage(file);
  const max = 1600;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c);
}

// Object URLs created for the current screen; released on navigation.
let liveUrls = [];
function urlFor(blob) { const u = URL.createObjectURL(blob); liveUrls.push(u); return u; }
function releaseUrls() { liveUrls.forEach(u => URL.revokeObjectURL(u)); liveUrls = []; }

// Hidden file picker (on phones the OS offers camera or library).
function pickPhotos(multiple = true) {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = multiple;
    inp.style.display = 'none';
    inp.onchange = () => { res([...inp.files]); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}

// ---------------------------------------------------------------- chrome
function setHeader(title, back, actionsHtml = '') {
  $('#title').textContent = title;
  const b = $('#backBtn');
  if (back) { b.hidden = false; b.href = back; b.innerHTML = icon('back'); } else { b.hidden = true; }
  $('#actions').innerHTML = actionsHtml;
}
const view = () => $('#view');
function setBottomBar(html) {
  $('.bottombar')?.remove();
  if (!html) return null;
  const bar = document.createElement('div');
  bar.className = 'bottombar';
  bar.innerHTML = html;
  document.body.appendChild(bar);
  return bar;
}

// ---------------------------------------------------------------- router
async function route() {
  await flushSaves();
  releaseUrls();
  setBottomBar('');
  window.scrollTo(0, 0);
  const p = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  try {
    if (p[0] === 's' && p[2] === 'i') return await viewItem(p[1], p[3]);
    if (p[0] === 's') return await viewSurvey(p[1]);
    if (p[0] === 'settings') return await viewSettings();
    return await viewHome();
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="empty">Something went wrong: ${esc(e.message)}<br><br><a class="btn" href="#/">Home</a></div>`;
  }
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------------------------------------------------------------- home
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; $('#installBtn')?.setAttribute('hidden', ''); toast('App installed'); });
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function installApp() {
  if (installPrompt) {
    try {
      const p = installPrompt; installPrompt = null;   // Chrome allows each prompt to be used once
      await p.prompt();
      if ((await p.userChoice).outcome === 'accepted') return;
    } catch (e) { console.warn(e); }
  }
  showInstallHelp();
}
function showInstallHelp() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const steps = ios
    ? (/CriOS|FxiOS|EdgiOS/.test(ua)
      ? ['Tap the <strong>Share</strong> button (square with an up arrow) in the address bar.', 'Choose <strong>Add to Home Screen</strong>. If it is not listed, open this page in <strong>Safari</strong> and try again.']
      : ['Tap the <strong>Share</strong> button (square with an up arrow) at the bottom of Safari.', 'Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.'])
    : ['Tap the browser menu <strong>⋮</strong> (top-right in Chrome).', 'Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.'];
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="Install">
    <h3>Install on this device</h3>
    <ol class="install-steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <p class="small muted">The app then opens full-screen from its home-screen icon and works without signal.${location.protocol !== 'https:' && location.hostname !== 'localhost' ? ' <strong>Note:</strong> installing only works when the app is opened from its secure <strong>https://</strong> address.' : ''}</p>
    <button class="btn primary block" id="ih-ok">OK</button></div>`;
  document.body.appendChild(back);
  back.onclick = e => { if (e.target === back || e.target.id === 'ih-ok') back.remove(); };
}

async function viewHome() {
  setHeader('adi Site Snag', null, `<a class="icon-btn" href="#/settings" aria-label="Settings">${icon('gear')}</a>`);
  const surveys = (await DB.all('surveys')).sort((a, b) => b.updatedAt - a.updatedAt);
  const items = await DB.all('items');
  const stats = {};
  for (const it of items) {
    const s = stats[it.surveyId] ||= { n: 0, open: 0 };
    s.n++; if (it.status !== 'Complete') s.open++;
  }
  view().innerHTML = `
    <div class="brand"><img src="img/adi-logo.jpg" alt="adi Climate Systems"><div class="brand-app">Site Survey<br>&amp; Snagging</div></div>
    <button id="installBtn" class="btn block" ${isInstalled() ? 'hidden' : ''} style="margin-bottom:12px">${icon('download')} Install app on this device</button>
    ${surveys.length ? `<div class="list">${surveys.map(s => {
      const st = stats[s.id] || { n: 0, open: 0 };
      return `<a class="survey-card" href="#/s/${s.id}">
        <div class="ico">${icon('clip')}</div>
        <div class="grow">
          <div class="title-line">${esc(s.site || 'Untitled survey')}</div>
          <div class="sub-line">${esc(fmtDate(s.date))}${s.surveyor ? ' · ' + esc(s.surveyor) : ''}</div>
          <div class="sub-line">${st.n} item${st.n === 1 ? '' : 's'} · ${st.open} open</div>
        </div></a>`;
    }).join('')}</div>` : `<div class="empty">${icon('clip')}<div><strong>No surveys yet</strong></div><div class="small">Start a new survey, then add photos as you walk the site.</div></div>`}
  `;
  $('#installBtn').onclick = installApp;
  const bar = setBottomBar(`<button class="btn primary" id="newSurvey">${icon('plus')} New survey</button>`);
  $('#newSurvey', bar).onclick = newSurvey;
}

async function newSurvey() {
  const s = {
    id: uid(), site: '', address: '', client: '', notes: '',
    surveyor: await Settings.get('surveyor', ''), date: today(),
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await DB.put('surveys', s);
  go(`#/s/${s.id}`);
}

// ---------------------------------------------------------------- survey
async function viewSurvey(id) {
  const s = await DB.get('surveys', id);
  if (!s) return go('#/');
  const items = await getItems(id);
  setHeader(s.site || 'New survey', '#/', `<button class="icon-btn" id="delSurvey" aria-label="Delete survey">${icon('trash')}</button>`);

  view().innerHTML = `
    <section class="card">
      <label><span>Site name</span><input id="f-site" value="${esc(s.site)}" placeholder="e.g. Plot 12, Riverside Court" autocomplete="off"></label>
      <label><span>Address / location</span><input id="f-address" value="${esc(s.address)}" autocomplete="off"></label>
      <div class="grid2">
        <label><span>Surveyor</span><select id="f-surveyor">${listSelect(await Settings.surveyors(), s.surveyor, 'Select surveyor…')}</select></label>
        <label><span>Date</span><input type="date" id="f-date" value="${esc(s.date)}"></label>
      </div>
      <label><span>Client / project ref</span><input id="f-client" value="${esc(s.client)}" autocomplete="off"></label>
      <label style="margin-bottom:0"><span>General notes</span><textarea id="f-notes" rows="2" placeholder="Optional">${esc(s.notes)}</textarea></label>
    </section>
    <h2 class="section"><span>Photos &amp; snags (${items.length})</span></h2>
    ${items.length ? `<div class="list">${items.map((it, i) => itemCard(it, i + 1, s.id)).join('')}</div>`
      : `<div class="empty">${icon('camera')}<div><strong>No photos yet</strong></div><div class="small">Tap “Add photo” to take a picture or choose from your library.</div></div>`}
  `;

  const saveSurvey = () => saveLater('survey', async () => {
    s.updatedAt = Date.now();
    await DB.put('surveys', s);
    if (s.surveyor) await Settings.set('surveyor', s.surveyor);
  });
  for (const f of ['site', 'address', 'date', 'client', 'notes']) {
    $(`#f-${f}`).addEventListener('input', e => {
      s[f] = e.target.value;
      if (f === 'site') $('#title').textContent = s.site || 'New survey';
      saveSurvey();
    });
  }
  bindListSelect($('#f-surveyor'), 'surveyors', () => Settings.surveyors(), 'Select surveyor…',
    v => { s.surveyor = v; saveSurvey(); }, 'Surveyor name to add');

  $('#delSurvey').onclick = async () => {
    if (!confirm(`Delete “${s.site || 'this survey'}” and all ${items.length} photo(s)? This cannot be undone.`)) return;
    pending.delete('survey');
    for (const it of items) await DB.del('items', it.id);
    await DB.del('surveys', s.id);
    toast('Survey deleted');
    go('#/');
  };

  const bar = setBottomBar(`
    <button class="btn primary" id="addPhoto">${icon('camera')} Add photo</button>
    <button class="btn dark" id="makePdf" ${items.length ? '' : 'disabled'}>${icon('file')} PDF report</button>`);
  $('#addPhoto', bar).onclick = () => addPhotos(s.id);
  $('#makePdf', bar).onclick = async () => { await flushSaves(); exportSheet(await DB.get('surveys', s.id), await getItems(s.id)); };
}

function itemCard(it, n, sid) {
  const tags = [];
  if (it.discipline) tags.push(`<span class="tag disc">${esc(it.discipline)}</span>`);
  if (it.actionBy) tags.push(`<span class="tag who">${esc(it.actionBy)}</span>`);
  if (it.dueDate) tags.push(`<span class="tag ${isOverdue(it) ? 'overdue' : ''}">Due ${esc(fmtDate(it.dueDate))}</span>`);
  if (it.priority) tags.push(`<span class="tag p-${esc(it.priority)}">${esc(it.priority)}</span>`);
  if (it.status === 'Complete') tags.push(`<span class="tag done">Complete</span>`);
  return `<a class="item-card ${it.status === 'Complete' ? 'is-done' : ''}" href="#/s/${sid}/i/${it.id}">
    <img src="${urlFor(it.annotated || it.photo)}" alt="">
    <div class="grow">
      <div class="num">#${n}${it.location ? ' · ' + esc(it.location) : ''}</div>
      <div class="desc">${esc(it.comment) || '<span class="muted">No comment yet</span>'}</div>
      <div class="tags">${tags.join('')}</div>
    </div></a>`;
}

async function addPhotos(surveyId) {
  await flushSaves();
  const files = await pickPhotos(true);
  if (!files.length) return;
  const done = busy(files.length > 1 ? `Adding ${files.length} photos…` : 'Adding photo…');
  let last;
  try {
    let t = Date.now();
    for (const f of files) {
      last = {
        id: uid(), surveyId, createdAt: t++,
        photo: await processPhoto(f), annotated: null, shapes: [],
        location: '', comment: '', discipline: '', actionBy: '', dueDate: '', priority: 'Medium', status: 'Open',
      };
      await DB.put('items', last);
    }
    await touchSurvey(surveyId);
  } catch (e) {
    alert(e.message);
  } finally { done(); }
  if (!last) return;
  if (files.length === 1) go(`#/s/${surveyId}/i/${last.id}`);
  else { toast(`${files.length} photos added`); go(`#/s/${surveyId}`); }
}

// ---------------------------------------------------------------- item
const DUE_QUICK = [['Today', 0], ['Tomorrow', 1], ['1 week', 7], ['2 weeks', 14], ['1 month', 28]];

async function viewItem(sid, iid) {
  const it = await DB.get('items', iid);
  if (!it) return go(`#/s/${sid}`);
  const all = await getItems(sid);
  const n = all.findIndex(x => x.id === iid) + 1;
  const locations = [...new Set(all.map(x => x.location).filter(Boolean))];
  const people = await Settings.people();
  const disciplines = await Settings.disciplines();
  setHeader(`Item #${n}`, `#/s/${sid}`, `<button class="icon-btn" id="delItem" aria-label="Delete item">${icon('trash')}</button>`);

  view().innerHTML = `
    <div class="photo-wrap"><img id="photo" alt="Photo"></div>
    <div class="row" style="margin-bottom:16px">
      <button class="btn dark" id="markup">${icon('pen')} Mark up</button>
      <button class="btn" id="replace">${icon('image')} Replace</button>
    </div>
    <section class="card">
      <label><span>Location / area</span><input id="loc" list="locs" value="${esc(it.location)}" placeholder="e.g. Kitchen, Level 2 corridor" autocomplete="off"></label>
      <datalist id="locs">${locations.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
      <label style="margin-bottom:0"><span>Comments / write-up</span><textarea id="comment" rows="4" placeholder="Describe the issue and what needs doing">${esc(it.comment)}</textarea></label>
    </section>
    <section class="card">
      <div class="field"><span class="lbl">Discipline</span><div class="chips" id="disc"></div></div>
      <div class="field"><span class="lbl">Who to action</span><div class="chips" id="people"></div></div>
      <div class="field"><span class="lbl">Action by</span>
        <div class="chips" id="dueQuick">${DUE_QUICK.map(([l, d]) => `<button class="chip" data-d="${d}">${l}</button>`).join('')}</div>
        <div class="due-row"><input type="date" id="dueDate" value="${esc(it.dueDate)}"><button class="chip" id="dueClear">Clear</button></div>
      </div>
      <div class="field"><span class="lbl">Priority</span><div class="seg" id="prio">${['Low', 'Medium', 'High'].map(p => `<button class="p-${p}" data-v="${p}">${p}</button>`).join('')}</div></div>
      <div class="field" style="margin-bottom:0"><span class="lbl">Status</span><div class="seg" id="status">${['Open', 'Complete'].map(p => `<button class="s-${p}" data-v="${p}">${p}</button>`).join('')}</div></div>
    </section>
  `;

  const showPhoto = () => { $('#photo').src = urlFor(it.annotated || it.photo); };
  showPhoto();
  const save = () => saveLater('item', async () => { await DB.put('items', it); await touchSurvey(sid); });

  $('#loc').oninput = e => { it.location = e.target.value; save(); };
  $('#comment').oninput = e => { it.comment = e.target.value; save(); };

  bindChipPicker($('#disc'), { get: () => it.discipline || '', set: v => { it.discipline = v; }, list: disciplines, settingsKey: 'disciplines', promptText: 'Discipline to add', onChange: save });
  bindChipPicker($('#people'), { get: () => it.actionBy, set: v => { it.actionBy = v; }, list: people, settingsKey: 'people', promptText: 'Name, company or trade to add', onChange: save });

  function renderDue() {
    $$('#dueQuick .chip').forEach(c => c.classList.toggle('on', !!it.dueDate && addDays(+c.dataset.d) === it.dueDate));
    $('#dueDate').value = it.dueDate || '';
  }
  renderDue();
  $('#dueQuick').onclick = e => { const b = e.target.closest('button'); if (!b) return; it.dueDate = addDays(+b.dataset.d); renderDue(); save(); };
  $('#dueDate').onchange = e => { it.dueDate = e.target.value; renderDue(); save(); };
  $('#dueClear').onclick = () => { it.dueDate = ''; renderDue(); save(); };

  const seg = (sel, key) => {
    const paint = () => $$(`${sel} button`).forEach(b => b.classList.toggle('on', b.dataset.v === it[key]));
    paint();
    $(sel).onclick = e => { const b = e.target.closest('button'); if (!b) return; it[key] = b.dataset.v; paint(); save(); };
  };
  seg('#prio', 'priority');
  seg('#status', 'status');

  $('#markup').onclick = async () => {
    await flushSaves();
    if (await openMarkup(it)) { await DB.put('items', it); await touchSurvey(sid); showPhoto(); toast('Mark-up saved'); }
  };
  $('#replace').onclick = async () => {
    const [f] = await pickPhotos(false); if (!f) return;
    if ((it.shapes || []).length && !confirm('Replacing the photo will remove its mark-up. Continue?')) return;
    const done = busy('Updating photo…');
    try { it.photo = await processPhoto(f); it.annotated = null; it.shapes = []; await DB.put('items', it); showPhoto(); }
    catch (e) { alert(e.message); } finally { done(); }
  };
  $('#delItem').onclick = async () => {
    if (!confirm('Delete this photo and its write-up?')) return;
    pending.delete('item');
    await DB.del('items', it.id); await touchSurvey(sid);
    toast('Item deleted'); go(`#/s/${sid}`);
  };

  const bar = setBottomBar(`
    <button class="btn" id="doneBtn">${icon('check')} Done</button>
    <button class="btn primary" id="nextBtn">${icon('camera')} Add another</button>`);
  $('#doneBtn', bar).onclick = () => go(`#/s/${sid}`);
  $('#nextBtn', bar).onclick = () => addPhotos(sid);
}

// ---------------------------------------------------------------- mark-up editor
const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111827'];
const TOOLS = [['arrow', 'Arrow'], ['pen', 'Draw'], ['rect', 'Box'], ['circle', 'Circle'], ['text', 'Text']];

function drawShape(ctx, s) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = s.w * 0.8;
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  ctx.beginPath();
  if (s.t === 'pen') {
    ctx.moveTo(a.x, a.y);
    for (const p of s.pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (s.t === 'arrow') {
    const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = s.w * 4.5;
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45));
    ctx.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  } else if (s.t === 'rect') {
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (s.t === 'circle') {
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 1, Math.abs(b.y - a.y) / 2 || 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.t === 'text') {
    const fs = s.w * 6;
    ctx.font = `bold ${fs}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const lines = s.text.split('\n');
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    const padd = fs * 0.3;
    ctx.shadowBlur = 0;
    ctx.fillStyle = ['#ffffff', '#facc15'].includes(s.color) ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.85)';
    ctx.fillRect(a.x - padd, a.y - padd, w + padd * 2, lines.length * fs * 1.2 + padd * 2 - fs * 0.2);
    ctx.fillStyle = s.color;
    lines.forEach((l, i) => ctx.fillText(l, a.x, a.y + i * fs * 1.2));
  }
  ctx.restore();
}

async function openMarkup(item) {
  const img = await blobToImage(item.photo);
  const W = img.naturalWidth, H = img.naturalHeight;
  const unit = Math.max(W, H) / 160;
  const shapes = JSON.parse(JSON.stringify(item.shapes || []));
  let tool = 'arrow', color = COLORS[0], size = 1, cur = null;

  const el = document.createElement('div');
  el.className = 'markup';
  el.innerHTML = `
    <div class="mk-bar top">
      <button class="mk-btn" data-a="cancel">Cancel</button>
      <div class="mk-group">
        <button class="mk-btn" data-a="undo" aria-label="Undo">${icon('undo')}</button>
        <button class="mk-btn" data-a="clear">Clear</button>
      </div>
      <button class="mk-btn done" data-a="done">Save</button>
    </div>
    <div class="mk-stage"><canvas></canvas></div>
    <div class="mk-bar bottom">
      <div class="mk-group">${TOOLS.map(([t, l]) => `<button class="mk-btn" data-t="${t}" aria-label="${l}" title="${l}">${icon(t)}</button>`).join('')}</div>
      <div class="mk-sep"></div>
      <div class="mk-group">${COLORS.map(c => `<button class="swatch" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      <div class="mk-sep"></div>
      <div class="mk-group">${[['S', 0.6], ['M', 1], ['L', 1.8]].map(([l, v]) => `<button class="mk-btn" data-s="${v}">${l}</button>`).join('')}</div>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const canvas = $('canvas', el), ctx = canvas.getContext('2d'), stage = $('.mk-stage', el);
  canvas.width = W; canvas.height = H;
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const sc = Math.min((r.width - 16) / W, (r.height - 16) / H);
    canvas.style.width = `${W * sc}px`; canvas.style.height = `${H * sc}px`;
  };
  const draw = () => {
    ctx.drawImage(img, 0, 0);
    for (const s of shapes) drawShape(ctx, s);
    if (cur) drawShape(ctx, cur);
  };
  const paintBars = () => {
    $$('[data-t]', el).forEach(b => b.classList.toggle('on', b.dataset.t === tool));
    $$('[data-c]', el).forEach(b => b.classList.toggle('on', b.dataset.c === color));
    $$('[data-s]', el).forEach(b => b.classList.toggle('on', +b.dataset.s === size));
  };
  fit(); draw(); paintBars();
  window.addEventListener('resize', fit);

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  };
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    const p = pos(e);
    if (tool === 'text') {
      const text = (prompt('Label text') || '').trim();
      if (text) { shapes.push({ t: 'text', color, w: unit * size, pts: [p], text }); draw(); }
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    cur = { t: tool, color, w: unit * size, pts: [p, p] };
  });
  canvas.addEventListener('pointermove', e => {
    if (!cur) return;
    const p = pos(e);
    if (cur.t === 'pen') cur.pts.push(p); else cur.pts[1] = p;
    draw();
  });
  const end = () => {
    if (!cur) return;
    const [a, b] = [cur.pts[0], cur.pts[cur.pts.length - 1]];
    if (cur.t === 'pen' ? cur.pts.length > 2 : Math.hypot(b.x - a.x, b.y - a.y) > unit * 2) shapes.push(cur);
    cur = null; draw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return new Promise(resolve => {
    const close = saved => {
      window.removeEventListener('resize', fit);
      document.body.style.overflow = '';
      el.remove();
      resolve(saved);
    };
    el.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) { tool = b.dataset.t; paintBars(); }
      else if (b.dataset.c) { color = b.dataset.c; paintBars(); }
      else if (b.dataset.s) { size = +b.dataset.s; paintBars(); }
      else if (b.dataset.a === 'undo') { shapes.pop(); draw(); }
      else if (b.dataset.a === 'clear') { if (shapes.length && confirm('Remove all mark-up?')) { shapes.length = 0; draw(); } }
      else if (b.dataset.a === 'cancel') close(false);
      else if (b.dataset.a === 'done') {
        cur = null; draw();
        item.shapes = shapes;
        item.annotated = shapes.length ? await canvasToBlob(canvas, 'image/jpeg', 0.88) : null;
        close(true);
      }
    });
  });
}

// ---------------------------------------------------------------- PDF export
let jsPdfLoading;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return jsPdfLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = res; s.onerror = () => { jsPdfLoading = null; rej(new Error('Could not load the PDF library')); };
    document.head.appendChild(s);
  });
}

function exportSheet(survey, items) {
  const who = [...new Set(items.map(i => i.actionBy).filter(Boolean))].sort();
  const discs = [...new Set(items.map(i => i.discipline).filter(Boolean))].sort();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="PDF report">
    <h3>PDF report</h3>
    <label><span>Include items for</span><select id="x-who">
      <option value="">Everyone (${items.length} items)</option>
      ${who.map(w => `<option value="${esc(w)}">${esc(w)} only (${items.filter(i => i.actionBy === w).length})</option>`).join('')}
    </select></label>
    ${discs.length ? `<label><span>Discipline</span><select id="x-disc">
      <option value="">All disciplines</option>
      ${discs.map(d => `<option value="${esc(d)}">${esc(d)} (${items.filter(i => i.discipline === d).length})</option>`).join('')}
    </select></label>` : ''}
    <label class="check"><input type="checkbox" id="x-summary" checked> Include summary page</label>
    <label class="check"><input type="checkbox" id="x-done" checked> Include completed items</label>
    <div class="row" style="margin-top:18px">
      <button class="btn primary" id="x-dl">${icon('download')} Save PDF</button>
      ${navigator.canShare ? `<button class="btn dark" id="x-share">${icon('share')} Share</button>` : ''}
    </div>
    <button class="btn block" id="x-cancel" style="margin-top:10px">Cancel</button>
  </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.onclick = e => { if (e.target === back) close(); };
  $('#x-cancel', back).onclick = close;

  const make = async () => {
    const opts = { person: $('#x-who', back).value, discipline: $('#x-disc', back)?.value || '', summary: $('#x-summary', back).checked, includeDone: $('#x-done', back).checked };
    const done = busy('Creating PDF…');
    try {
      await loadJsPdf();
      const blob = await buildPdf(survey, items, opts);
      const name = `Snagging - ${(survey.site || 'Survey').replace(/[\\/:*?"<>|]+/g, '-')}${[opts.discipline, opts.person].filter(Boolean).map(x => ' - ' + x.replace(/[\\/:*?"<>|]+/g, '-')).join('')} - ${survey.date || today()}.pdf`;
      return { blob, name };
    } finally { done(); }
  };
  $('#x-dl', back).onclick = async () => {
    try {
      const { blob, name } = await make();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
      close(); toast('PDF saved');
    } catch (e) { alert(e.message); }
  };
  $('#x-share', back)?.addEventListener('click', async () => {
    try {
      const { blob, name } = await make();
      const file = new File([blob], name, { type: 'application/pdf' });
      if (!navigator.canShare({ files: [file] })) { alert('Sharing files is not supported here — use Save PDF instead.'); return; }
      await navigator.share({ files: [file], title: name });
      close();
    } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
  });
}

async function buildPdf(survey, allItems, opts = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const PW = 210, PH = 297, M = 12, CW = PW - M * 2;
  const company = await Settings.company();
  const numbered = allItems.map((it, i) => ({ ...it, no: i + 1 }));
  const items = numbered.filter(it => (!opts.person || it.actionBy === opts.person)
    && (!opts.discipline || it.discipline === opts.discipline)
    && (opts.includeDone !== false || it.status !== 'Complete'));
  const PRIO = { High: [220, 38, 38], Medium: [217, 119, 6], Low: [22, 163, 74] };
  const NAVY = [17, 20, 24], MUTED = [100, 116, 139], SKY = [140, 210, 244], BLUE = [11, 111, 174], SKY_SOFT = [232, 246, 253];
  const filterLabel = [opts.discipline, opts.person].filter(Boolean).join(' · ');
  const title = filterLabel ? `Snagging Report — ${filterLabel}` : 'Site Survey / Snagging Report';
  let logo = null;
  try { logo = await blobToDataURL(await (await fetch('img/adi-logo.jpg')).blob()); } catch { /* PDF still works without the logo */ }

  const text = (str, x, y, { size = 10, style = 'normal', color = NAVY, align = 'left' } = {}) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(String(str ?? ''), x, y, { align, baseline: 'top' });
  };
  const fitLine = (str, w, size, style = 'normal') => {
    doc.setFont('helvetica', style); doc.setFontSize(size);
    str = String(str ?? '').replace(/\s+/g, ' ');
    if (doc.getTextWidth(str) <= w) return str;
    while (str && doc.getTextWidth(str + '…') > w) str = str.slice(0, -1);
    return str + '…';
  };
  const wrap = (str, w, size, maxLines) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
    let lines = doc.splitTextToSize(String(str ?? ''), w);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fitLine(lines[maxLines - 1] + '…', w, size); }
    return lines;
  };

  let first = true;
  const newPage = () => {
    if (!first) doc.addPage();
    first = false;
    doc.setFillColor(...SKY); doc.rect(0, 0, PW, 3, 'F');
    if (logo) doc.addImage(logo, 'JPEG', M, 5.5, 13 * 554 / 176, 13, 'adi-logo', 'FAST');
    else text(company, M, 9, { size: 12, style: 'bold' });
    text(fitLine(title, 120, 13, 'bold'), PW - M, 5.5, { size: 13, style: 'bold', align: 'right' });
    text(fitLine(survey.site || 'Untitled survey', 120, 10, 'bold'), PW - M, 11, { size: 10, style: 'bold', color: BLUE, align: 'right' });
    text(`Survey date: ${fmtDate(survey.date)}`, PW - M, 15.8, { size: 9, color: MUTED, align: 'right' });
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(M, 21, PW - M, 21);
  };

  // ---- summary page
  if (opts.summary !== false) {
    newPage();
    let y = 27;
    const kv = [
      ['Company', company], ['Site', survey.site], ['Address / location', survey.address], ['Client / project ref', survey.client],
      ['Surveyor', survey.surveyor], ['Date of survey', fmtDate(survey.date)],
      ['Items in this report', `${items.length}  (${items.filter(i => i.status !== 'Complete').length} open, ${items.filter(i => i.status === 'Complete').length} complete)`],
    ];
    doc.setFillColor(248, 250, 252); doc.roundedRect(M, y, CW, kv.length * 7 + 6, 2, 2, 'F');
    y += 4;
    for (const [k, v] of kv) {
      text(k, M + 4, y, { size: 9, color: MUTED });
      text(fitLine(v || '—', CW - 58, 10, 'bold'), M + 50, y - 0.5, { size: 10, style: 'bold' });
      y += 7;
    }
    y += 6;
    if (survey.notes) {
      text('NOTES', M, y, { size: 8, style: 'bold', color: MUTED }); y += 5;
      const lines = wrap(survey.notes, CW, 10, 8);
      text(lines.join('\n'), M, y, { size: 10 }); y += lines.length * 4.6 + 5;
    }

    // actions by person
    const groups = {};
    for (const it of items) {
      const g = groups[it.actionBy || 'Unassigned'] ||= { n: 0, open: 0, due: '' };
      g.n++;
      if (it.status !== 'Complete') { g.open++; if (it.dueDate && (!g.due || it.dueDate < g.due)) g.due = it.dueDate; }
    }
    const table = (cols, rows, startY) => {
      let yy = startY;
      const head = () => {
        doc.setFillColor(...NAVY); doc.rect(M, yy, CW, 7, 'F');
        doc.setFillColor(...SKY); doc.rect(M, yy + 6.4, CW, 0.6, 'F');
        let x = M + 2;
        for (const c of cols) { text(c.h, c.align === 'right' ? x + c.w - 4 : x, yy + 2, { size: 8, style: 'bold', color: [255, 255, 255], align: c.align || 'left' }); x += c.w; }
        yy += 7;
      };
      head();
      rows.forEach((r, ri) => {
        if (yy + 7 > PH - 18) { newPage(); yy = 27; head(); }
        if (ri % 2) { doc.setFillColor(248, 250, 252); doc.rect(M, yy, CW, 7, 'F'); }
        let x = M + 2;
        cols.forEach((c, ci) => {
          const cell = r[ci];
          const color = cell && cell.color ? cell.color : NAVY;
          const val = cell && typeof cell === 'object' ? cell.v : cell;
          text(fitLine(val, c.w - 4, 9), c.align === 'right' ? x + c.w - 4 : x, yy + 2, { size: 9, color, align: c.align || 'left' });
          x += c.w;
        });
        yy += 7;
      });
      return yy;
    };
    text('ACTIONS BY PERSON', M, y, { size: 8, style: 'bold', color: MUTED }); y += 5;
    y = table(
      [{ h: 'Who to action', w: 90 }, { h: 'Items', w: 25, align: 'right' }, { h: 'Open', w: 25, align: 'right' }, { h: 'Earliest due (open)', w: CW - 140 }],
      Object.entries(groups).sort().map(([k, g]) => [k, g.n, g.open, g.due ? fmtDate(g.due) : '—']), y) + 8;

    if (y > PH - 40) { newPage(); y = 27; }
    text('ITEM SCHEDULE', M, y, { size: 8, style: 'bold', color: MUTED }); y += 5;
    table(
      [{ h: '#', w: 8 }, { h: 'Location', w: 27 }, { h: 'Description', w: 45 }, { h: 'Discipline', w: 23 }, { h: 'Action by', w: 28 }, { h: 'Due', w: 20 }, { h: 'Priority', w: 16 }, { h: 'Status', w: CW - 167 }],
      items.map(it => [it.no, it.location || '—', it.comment || '—', it.discipline || '—', it.actionBy || '—',
        { v: it.dueDate ? fmtDate(it.dueDate) : '—', color: isOverdue(it) ? PRIO.High : NAVY },
        { v: it.priority || '—', color: PRIO[it.priority] || NAVY },
        { v: it.status === 'Complete' ? 'Complete' : 'Open', color: it.status === 'Complete' ? PRIO.Low : NAVY }]), y);
  }

  // ---- item pages: two per A4, photo left, write-up right
  const TOP = 25, BOTTOM = PH - 16, SLOT = (BOTTOM - TOP) / 2;
  const IMG_W = 108, TX = M + IMG_W + 6, TW = PW - M - TX;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (i % 2 === 0) newPage();
    const y0 = TOP + (i % 2) * SLOT + 2, h = SLOT - 6;
    if (i % 2 === 1) { doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.line(M, y0 - 4, PW - M, y0 - 4); }

    // photo
    const blob = it.annotated || it.photo;
    const data = await blobToDataURL(blob);
    const img = await blobToImage(blob);
    const sc = Math.min(IMG_W / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
    doc.addImage(data, 'JPEG', M + (IMG_W - iw) / 2, y0, iw, ih, undefined, 'FAST');
    doc.setDrawColor(203, 213, 225); doc.rect(M + (IMG_W - iw) / 2, y0, iw, ih);

    // write-up
    const pc = PRIO[it.priority] || MUTED;
    doc.setFillColor(...pc); doc.rect(TX - 3, y0, 1.2, h, 'F');
    text(`Item ${it.no}`, TX, y0, { size: 15, style: 'bold' });
    // priority / status pills
    const pill = (label, rgb, x, y) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const w = doc.getTextWidth(label) + 5;
      doc.setFillColor(...rgb); doc.roundedRect(x - w, y, w, 5.5, 1.5, 1.5, 'F');
      text(label, x - w / 2, y + 1.2, { size: 8, style: 'bold', color: [255, 255, 255], align: 'center' });
      return w;
    };
    let px = PW - M;
    if (it.status === 'Complete') px -= pill('COMPLETE', PRIO.Low, px, y0 + 0.5) + 2;
    if (it.priority) pill(it.priority.toUpperCase(), pc, px, y0 + 0.5);

    let y = y0 + 10;
    const field = (label, value, color = NAVY) => {
      text(label.toUpperCase(), TX, y, { size: 7.5, style: 'bold', color: MUTED }); y += 3.8;
      const lines = wrap(value || '—', TW, 10.5, 2);
      text(lines.join('\n'), TX, y, { size: 10.5, style: 'bold', color }); y += lines.length * 4.8 + 2.5;
    };
    field('Location / area', it.location);
    field('Discipline', it.discipline);
    // action box (who + by when)
    const whoLines = wrap(it.actionBy || 'Unassigned', TW - 6, 10.5, 2);
    const dueStr = it.dueDate ? fmtDate(it.dueDate) + (isOverdue(it) ? '  (OVERDUE)' : '') : 'No date set';
    const boxH = 3 + 3.8 + whoLines.length * 4.8 + 1.5 + 3.8 + 4.8 + 2;
    doc.setFillColor(...SKY_SOFT); doc.setDrawColor(...SKY); doc.setLineWidth(0.5);
    doc.roundedRect(TX, y, TW, boxH, 1.5, 1.5, 'FD');
    let by = y + 3;
    text('WHO TO ACTION', TX + 3, by, { size: 7.5, style: 'bold', color: BLUE }); by += 3.8;
    text(whoLines.join('\n'), TX + 3, by, { size: 10.5, style: 'bold' }); by += whoLines.length * 4.8 + 1.5;
    text('ACTION BY', TX + 3, by, { size: 7.5, style: 'bold', color: BLUE }); by += 3.8;
    text(dueStr, TX + 3, by, { size: 10.5, style: 'bold', color: isOverdue(it) ? PRIO.High : NAVY });
    y += boxH + 4;

    text('COMMENTS', TX, y, { size: 7.5, style: 'bold', color: MUTED }); y += 3.8;
    const maxLines = Math.max(1, Math.floor((y0 + h - y) / 4.4));
    const lines = wrap(it.comment || '—', TW, 10, maxLines);
    text(lines.join('\n'), TX, y, { size: 10 });
  }

  // ---- footers with page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
    text(fitLine(`${company ? company + ' · ' : ''}Surveyor: ${survey.surveyor || '—'}`, 90, 8), M, PH - 9.5, { size: 8, color: MUTED });
    text(`Printed ${fmtDate(today())}`, PW / 2 + 18, PH - 9.5, { size: 8, color: MUTED, align: 'center' });
    text(`Page ${p} of ${total}`, PW - M, PH - 9.5, { size: 8, color: MUTED, align: 'right' });
  }
  return doc.output('blob');
}

// ---------------------------------------------------------------- settings & backup
async function viewSettings() {
  setHeader('Settings', '#/');
  const LISTS = [
    ['surveyors', 'Surveyors', 'Surveyor name', () => Settings.surveyors(), 'Shown in the surveyor drop-down on each survey.'],
    ['disciplines', 'Disciplines', 'Discipline', () => Settings.disciplines(), 'One-tap buttons on every photo.'],
    ['people', 'Who to action', 'Name, company or trade', () => Settings.people(), 'One-tap buttons on every photo.'],
  ];
  view().innerHTML = `
    <section class="card">
      <label><span>Company name (shown on the PDF)</span><input id="s-company" value="${esc(await Settings.company())}" autocomplete="organization"></label>
      <label style="margin-bottom:0"><span>Default surveyor for new surveys</span><select id="s-surveyor">${listSelect(await Settings.surveyors(), await Settings.get('surveyor', ''), 'None')}</select></label>
    </section>
    ${LISTS.map(([key, title, , , help]) => `
      <h2 class="section">${title}</h2>
      <section class="card">
        <div class="chips" id="s-${key}"></div>
        <p class="small muted" style="margin:12px 0 0">${help} Tap a name to remove it.</p>
      </section>`).join('')}
    <h2 class="section">Storage on this device</h2>
    <section class="card" id="s-storage"><span class="small muted">Checking…</span></section>
    <h2 class="section">Backup</h2>
    <section class="card">
      <p class="small muted" style="margin-top:0">Everything is stored only on this device. Back up to a file to keep a copy or move surveys to another phone, tablet or computer.</p>
      <div class="row">
        <button class="btn" id="s-backup">${icon('download')} Back up all</button>
        <button class="btn" id="s-restore">${icon('share')} Restore file</button>
      </div>
    </section>
    <p class="small muted" style="text-align:center">adi Site Snag · works offline · no sign-in</p>`;

  for (const [key, , promptText, getList] of LISTS) {
    const el = $(`#s-${key}`);
    let list = await getList();
    const render = () => {
      el.innerHTML = list.map(p => `<button class="chip" data-p="${esc(p)}">${esc(p)} ✕</button>`).join('') + `<button class="chip add" data-add="1">+ Add</button>`;
    };
    render();
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) {
        const name = (prompt(promptText) || '').trim();
        if (!name || list.includes(name)) return;
        list = [...list, name];
      } else {
        if (!confirm(`Remove “${b.dataset.p}” from the list? Existing surveys keep it.`)) return;
        list = list.filter(p => p !== b.dataset.p);
      }
      await Settings.set(key, list); render();
      if (key === 'surveyors') $('#s-surveyor').innerHTML = listSelect(list, await Settings.get('surveyor', ''), 'None');
    };
  }
  $('#s-company').oninput = e => saveLater('company', () => Settings.set('company', e.target.value.trim()));
  bindListSelect($('#s-surveyor'), 'surveyors', () => Settings.surveyors(), 'None',
    v => Settings.set('surveyor', v), 'Surveyor name to add');

  (async () => {
    const items = await DB.all('items');
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
    const el = $('#s-storage'); if (!el) return;
    el.innerHTML = `<div><strong>${items.length}</strong> photo${items.length === 1 ? '' : 's'} saved${est ? ` · <strong>${mb(est.usage)} MB</strong> used` : ''}</div>
      ${est && est.quota ? `<div class="meter"><div style="width:${Math.max(1, Math.min(100, est.usage / est.quota * 100)).toFixed(1)}%"></div></div>
      <div class="small muted">About ${est.quota > 1073741824 ? (est.quota / 1073741824).toFixed(1) + ' GB' : mb(est.quota) + ' MB'} available to the app on this device. Each photo takes roughly 0.2–0.5 MB.</div>` : ''}`;
  })();

  $('#s-backup').onclick = async () => {
    const done = busy('Preparing backup…');
    try {
      const items = await DB.all('items');
      for (const it of items) {
        it.photo = await blobToDataURL(it.photo);
        it.annotated = it.annotated ? await blobToDataURL(it.annotated) : null;
      }
      const data = {
        app: 'site-snag', version: 1, exportedAt: new Date().toISOString(),
        settings: { people: await Settings.people(), surveyors: await Settings.surveyors(), disciplines: await Settings.disciplines(), company: await Settings.company(), surveyor: await Settings.get('surveyor', '') },
        surveys: await DB.all('surveys'), items,
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `site-snag-backup-${today()}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
    } catch (e) { alert(e.message); } finally { done(); }
  };
  $('#s-restore').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const done = busy('Restoring…');
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'site-snag') throw new Error('That file is not a Site Snag backup.');
        for (const s of data.surveys) await DB.put('surveys', s);
        for (const it of data.items) {
          it.photo = await dataURLToBlob(it.photo);
          it.annotated = it.annotated ? await dataURLToBlob(it.annotated) : null;
          await DB.put('items', it);
        }
        for (const key of ['people', 'surveyors', 'disciplines']) {
          const mine = await Settings[key]();
          await Settings.set(key, [...new Set([...mine, ...(data.settings?.[key] || [])])]);
        }
        toast(`Restored ${data.surveys.length} survey(s)`);
        go('#/');
      } catch (e) { alert(e.message); } finally { done(); }
    };
    inp.click();
  };
}

// ---------------------------------------------------------------- boot
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err)));
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); });

// Exposed for automated tests.
window.SiteSnag = { buildPdf, getItems, DB, loadJsPdf };

seedDefaults().catch(console.warn).finally(route);
})();
