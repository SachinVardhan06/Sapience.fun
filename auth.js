const authState = { user: null, progress: { checklist: {}, lessons: {} }, study: { bookmarks: {}, notes: {}, bestQuiz: 0 } };
const checklistKey = 'sapience-website-checklist-v1';
const lessonsKey = 'sapience-lessons-v1';
const studyKey = 'sapience-study-v1';
const ownerKey = 'sapience-local-progress-owner';
const safeLocal = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
const localProgress = () => ({ checklist: safeLocal(checklistKey), lessons: safeLocal(lessonsKey) });
const canImportLocal = () => { try { const owner = localStorage.getItem(ownerKey); return !owner || owner === authState.user?.id; } catch { return false; } };
const cleanStudy = raw => {
  const keys = ['identity', 'attacks', 'software', 'response'];
  const bookmarks = Object.fromEntries(keys.filter(key => typeof raw?.bookmarks?.[key] === 'boolean').map(key => [key, raw.bookmarks[key]]));
  const notes = Object.fromEntries(keys.filter(key => typeof raw?.notes?.[key] === 'string').map(key => [key, raw.notes[key].slice(0, 2000)]));
  const bestQuiz = Number.isInteger(raw?.bestQuiz) && raw.bestQuiz >= 0 && raw.bestQuiz <= 4 ? raw.bestQuiz : 0;
  return { bookmarks, notes, bestQuiz };
};
const authRequest = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
  let data = {};
  try { data = await response.json(); } catch { /* Show the HTTP failure below. */ }
  if (!response.ok) throw new Error(data.error || 'The server could not complete this request.');
  return data;
};
let saving = Promise.resolve();
let savingStudy = Promise.resolve();
function saveProgress() {
  if (!authState.user) return;
  const payload = JSON.stringify(authState.progress);
  saving = saving.catch(() => {}).then(() => authRequest('/api/progress', { method: 'POST', body: payload }));
  saving.catch(() => document.dispatchEvent(new CustomEvent('sapience:syncerror')));
}
function saveStudy() {
  if (!authState.user) return;
  const payload = JSON.stringify(authState.study);
  savingStudy = savingStudy.catch(() => {}).then(() => authRequest('/api/study', { method: 'POST', body: payload }));
  savingStudy.catch(() => document.dispatchEvent(new CustomEvent('sapience:syncerror')));
}
window.sapienceAuth = {
  get user() { return authState.user; },
  get progress() { return authState.progress; },
  get study() { return authState.study; },
  update(type, key, checked) {
    authState.progress[type][key] = checked;
    try { localStorage.setItem(type === 'checklist' ? checklistKey : lessonsKey, JSON.stringify(authState.progress[type])); } catch { /* Local storage is optional. */ }
    saveProgress();
  },
  replace(type, values) {
    authState.progress[type] = values;
    try { localStorage.setItem(type === 'checklist' ? checklistKey : lessonsKey, JSON.stringify(values)); } catch { /* Local storage is optional. */ }
    saveProgress();
  },
  updateStudy(type, key, value) {
    if (type === 'bestQuiz') authState.study.bestQuiz = Math.max(authState.study.bestQuiz, value);
    else authState.study[type][key] = value;
    try { localStorage.setItem(studyKey, JSON.stringify(authState.study)); } catch { /* Local storage is optional. */ }
    saveStudy();
    updateDashboard();
  }
};
function updateNavigation() {
  document.querySelectorAll('.account-link').forEach(link => { link.textContent = authState.user ? 'My progress' : 'Log in'; });
  document.dispatchEvent(new CustomEvent('sapience:session', { detail: { user: authState.user } }));
}
function updateDashboard() {
  const dashboard = document.getElementById('account-dashboard');
  const forms = document.getElementById('auth-forms');
  if (!dashboard || !forms) return;
  dashboard.hidden = !authState.user;
  forms.hidden = !!authState.user;
  if (!authState.user) return;
  document.getElementById('account-greeting').textContent = `Welcome, ${authState.user.name.split(/\s+/)[0]}.`;
  document.getElementById('account-email').textContent = authState.user.email;
  document.getElementById('lesson-total').textContent = `${Object.values(authState.progress.lessons).filter(Boolean).length} / 4`;
  document.getElementById('check-total').textContent = `${Object.values(authState.progress.checklist).filter(Boolean).length} / 15`;
  document.getElementById('bookmark-total').textContent = String(Object.values(authState.study.bookmarks).filter(Boolean).length);
  document.getElementById('quiz-total').textContent = `${authState.study.bestQuiz} / 4`;
}
async function loadStudy() {
  const remote = await authRequest('/api/study');
  const local = cleanStudy(canImportLocal() ? safeLocal(studyKey) : {});
  authState.study = {
    bookmarks: Object.keys(remote.bookmarks).length ? remote.bookmarks : (local.bookmarks || {}),
    notes: Object.keys(remote.notes).length ? remote.notes : (local.notes || {}),
    bestQuiz: Math.max(remote.bestQuiz || 0, local.bestQuiz || 0)
  };
  if ((!Object.keys(remote.bookmarks).length && Object.keys(local.bookmarks || {}).length) ||
      (!Object.keys(remote.notes).length && Object.keys(local.notes || {}).length) ||
      authState.study.bestQuiz !== remote.bestQuiz) saveStudy();
  try { localStorage.setItem(studyKey, JSON.stringify(authState.study)); } catch { /* The server remains the source of truth. */ }
  try { localStorage.setItem(ownerKey, authState.user.id); } catch { /* Browser storage is optional. */ }
  document.dispatchEvent(new CustomEvent('sapience:studyready', { detail: authState.study }));
  updateDashboard();
}
async function loadProgress() {
  const remote = await authRequest('/api/progress');
  const local = canImportLocal() ? localProgress() : { checklist: {}, lessons: {} };
  authState.progress = {
    checklist: Object.keys(remote.checklist).length ? remote.checklist : local.checklist,
    lessons: Object.keys(remote.lessons).length ? remote.lessons : local.lessons
  };
  if ((!Object.keys(remote.checklist).length && Object.keys(local.checklist).length) ||
      (!Object.keys(remote.lessons).length && Object.keys(local.lessons).length)) saveProgress();
  try {
    localStorage.setItem(checklistKey, JSON.stringify(authState.progress.checklist));
    localStorage.setItem(lessonsKey, JSON.stringify(authState.progress.lessons));
  } catch { /* Account progress is still available from the server. */ }
  document.dispatchEvent(new CustomEvent('sapience:authready', { detail: authState.progress }));
  await loadStudy();
}
async function initializeAuth() {
  try {
    const { user } = await authRequest('/api/me');
    authState.user = user;
    updateNavigation();
    if (user) await loadProgress();
    else updateDashboard();
  } catch {
    if (document.body.dataset.page === 'account') {
      const message = document.getElementById('auth-message');
      message.textContent = 'Account service is unavailable. Start the site with npm start.';
    }
  }
}

const tabs = [document.getElementById('login-tab'), document.getElementById('register-tab')];
function selectForm(index) {
  tabs.forEach((tab, i) => { if (tab) { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; } });
  document.getElementById('login-form').hidden = index !== 0;
  document.getElementById('register-form').hidden = index !== 1;
  document.getElementById('auth-message').textContent = '';
}
tabs.forEach((tab, index) => tab?.addEventListener('click', () => selectForm(index)));
tabs.forEach((tab, index) => tab?.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const next = 1 - index;
  selectForm(next);
  tabs[next].focus();
}));
for (const mode of ['login', 'register']) {
  const form = document.getElementById(`${mode}-form`);
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.getElementById('auth-message');
    message.textContent = '';
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const { user } = await authRequest(`/api/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
      authState.user = user;
      form.reset();
      updateNavigation();
      await loadProgress();
      const next = new URLSearchParams(location.search).get('next');
      if (next && (/^\/(learn|protect|resources)\.html$/.test(next) || next === '/index.html#feedback')) location.assign(next);
      else updateDashboard();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
document.getElementById('signout-button')?.addEventListener('click', async () => {
  const message = document.getElementById('dashboard-message');
  try {
    await authRequest('/api/logout', { method: 'POST', body: '{}' });
    authState.user = null;
    authState.progress = { checklist: {}, lessons: {} };
    authState.study = { bookmarks: {}, notes: {}, bestQuiz: 0 };
    try { localStorage.removeItem(checklistKey); localStorage.removeItem(lessonsKey); localStorage.removeItem(studyKey); localStorage.removeItem(ownerKey); } catch { /* Ignore storage errors. */ }
    updateNavigation();
    updateDashboard();
  } catch (error) { message.textContent = error.message; }
});
initializeAuth();
