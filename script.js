const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const closeMenu = () => {
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Open menu');
  navLinks?.classList.remove('open');
};
menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
  navLinks?.classList.toggle('open', !isOpen);
});
navLinks?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu();
});
document.querySelectorAll('#year').forEach(year => { year.textContent = new Date().getFullYear(); });

const motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (motionAllowed && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));
}

const challenge = document.querySelector('[data-challenge]');
challenge?.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => {
    const correct = button.dataset.correct === 'true';
    challenge.querySelectorAll('button').forEach(option => option.classList.remove('selected'));
    button.classList.add('selected');
    const feedback = challenge.querySelector('.challenge-feedback');
    feedback.textContent = correct
      ? 'Exactly. Unique credentials and MFA reduce the risk of a reused password.'
      : 'Try again. Think about how to protect the account if that password is exposed.';
    feedback.classList.toggle('correct', correct);
  });
});

const lessonTabs = [...document.querySelectorAll('[role="tab"][data-lesson]')];
function activateLesson(tab, focus = false) {
  clearInterval(walkthroughTimer);
  lessonTabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
  if (focus) tab.focus();
}
lessonTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateLesson(tab));
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % lessonTabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + lessonTabs.length) % lessonTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lessonTabs.length - 1;
    else return;
    event.preventDefault();
    activateLesson(lessonTabs[next], true);
  });
});

const walkthroughs = {
  identity: [
    ['01 / A password is reused', 'A leaked password from another site gives an attacker a possible way into the admin account.', 'EXPOSED CREDENTIAL'],
    ['02 / Add a unique password', 'A password manager creates a different, strong password for this account.', 'UNIQUE PASSWORD'],
    ['03 / Require a second factor', 'MFA adds another check even if the password is later exposed.', 'MFA ENABLED']
  ],
  attacks: [
    ['01 / Untrusted input arrives', 'A form or URL parameter can contain data chosen by someone outside your team.', 'UNTRUSTED INPUT'],
    ['02 / The server checks it', 'Validate the expected format and use parameterized queries before the data reaches storage.', 'SERVER VALIDATION'],
    ['03 / The page handles it safely', 'Encode untrusted text when displaying it, and check permission for the requested action.', 'SAFE OUTPUT + ACCESS']
  ],
  software: [
    ['01 / Know what is deployed', 'List your packages, services, and integrations so each component has an owner.', 'INVENTORY'],
    ['02 / Patch with a plan', 'Track security updates, test them, then deploy them promptly.', 'UPDATED COMPONENTS'],
    ['03 / Protect the secrets', 'Keep API keys out of public code and rotate any key that was exposed.', 'SECRETS SECURED']
  ],
  response: [
    ['01 / Detect a signal', 'A sign-in alert or an unexpected change can reveal trouble early.', 'ALERT RECEIVED'],
    ['02 / Contain the problem', 'Disable the affected account or key and preserve useful logs.', 'ACCESS CONTAINED'],
    ['03 / Restore and learn', 'Recover from a tested backup, then update the plan using what you found.', 'SERVICE RECOVERED']
  ]
};
let walkthroughTimer;
document.querySelectorAll('.lesson-panel').forEach(panel => {
  const key = panel.id.replace('panel-', '');
  const steps = walkthroughs[key];
  if (!steps) return;
  let index = 0;
  const lab = document.createElement('div');
  lab.className = 'lesson-lab';
  lab.innerHTML = '<div class="lab-heading"><span>INTERACTIVE WALKTHROUGH</span><span class="lab-counter"></span></div><div class="lab-visual"><span class="lab-node">SIGNAL</span><span class="lab-line"></span><span class="lab-state"></span></div><strong class="lab-title"></strong><p class="lab-copy"></p><div class="lab-controls"><button type="button" class="lab-prev" aria-label="Previous step">←</button><button type="button" class="lab-play">Play steps</button><button type="button" class="lab-next" aria-label="Next step">→</button></div><div class="lesson-actions"><button type="button" class="lesson-complete" aria-pressed="false">Mark lesson complete</button><button type="button" class="lesson-bookmark" aria-pressed="false">☆ Save lesson</button></div><div class="lesson-note-box"><label>Private note <textarea maxlength="2000" rows="3" placeholder="What should you remember from this lesson?"></textarea></label><button type="button" class="save-note">Save note</button><span class="note-status" role="status" aria-live="polite"></span></div>';
  panel.append(lab);
  const render = () => {
    lab.querySelector('.lab-counter').textContent = `${index + 1} / ${steps.length}`;
    lab.querySelector('.lab-state').textContent = steps[index][2];
    lab.querySelector('.lab-title').textContent = steps[index][0];
    lab.querySelector('.lab-copy').textContent = steps[index][1];
    lab.querySelector('.lab-prev').disabled = index === 0;
    lab.querySelector('.lab-next').disabled = index === steps.length - 1;
    lab.querySelector('.lab-line').style.setProperty('--step', `${((index + 1) / steps.length) * 100}%`);
  };
  const stop = () => { clearInterval(walkthroughTimer); lab.querySelector('.lab-play').textContent = 'Play steps'; };
  lab.querySelector('.lab-prev').addEventListener('click', () => { stop(); index--; render(); });
  lab.querySelector('.lab-next').addEventListener('click', () => { stop(); index++; render(); });
  lab.querySelector('.lab-play').addEventListener('click', () => {
    if (lab.querySelector('.lab-play').textContent === 'Pause') return stop();
    if (index === steps.length - 1) index = 0;
    render();
    lab.querySelector('.lab-play').textContent = 'Pause';
    walkthroughTimer = setInterval(() => {
      if (index === steps.length - 1) return stop();
      index++;
      render();
    }, 1700);
  });
  const complete = lab.querySelector('.lesson-complete');
  const readLessons = () => { try { return JSON.parse(localStorage.getItem('sapience-lessons-v1') || '{}') || {}; } catch { return {}; } };
  const showComplete = value => {
    complete.setAttribute('aria-pressed', String(value));
    complete.textContent = value ? '✓ Lesson completed' : 'Mark lesson complete';
    document.getElementById(`tab-${key}`)?.setAttribute('data-complete', String(value));
  };
  showComplete(readLessons()[key] === true);
  complete.addEventListener('click', () => {
    const value = complete.getAttribute('aria-pressed') !== 'true';
    showComplete(value);
    const updated = { ...readLessons(), [key]: value };
    try { localStorage.setItem('sapience-lessons-v1', JSON.stringify(updated)); } catch { /* Continue without local storage. */ }
    window.sapienceAuth?.update('lessons', key, value);
  });
  document.addEventListener('sapience:authready', event => { showComplete(event.detail.lessons[key] === true); });
  const readStudy = () => { try { return JSON.parse(localStorage.getItem('sapience-study-v1') || '{}') || {}; } catch { return {}; } };
  const bookmark = lab.querySelector('.lesson-bookmark');
  const note = lab.querySelector('textarea');
  const showStudy = study => {
    const saved = study.bookmarks?.[key] === true;
    bookmark.setAttribute('aria-pressed', String(saved));
    bookmark.textContent = saved ? '★ Saved lesson' : '☆ Save lesson';
    note.value = study.notes?.[key] || '';
  };
  showStudy(readStudy());
  bookmark.addEventListener('click', () => {
    const saved = bookmark.getAttribute('aria-pressed') !== 'true';
    window.sapienceAuth?.updateStudy('bookmarks', key, saved);
    bookmark.setAttribute('aria-pressed', String(saved));
    bookmark.textContent = saved ? '★ Saved lesson' : '☆ Save lesson';
  });
  lab.querySelector('.save-note').addEventListener('click', () => {
    window.sapienceAuth?.updateStudy('notes', key, note.value.trim());
    lab.querySelector('.note-status').textContent = window.sapienceAuth?.user ? 'Note saved to your account.' : 'Note saved on this device.';
  });
  document.addEventListener('sapience:studyready', event => showStudy(event.detail));
  render();
});
document.querySelectorAll('[role="tab"][data-lesson]').forEach(tab => tab.addEventListener('click', () => clearInterval(walkthroughTimer)));

const quiz = document.getElementById('defender-quiz');
if (quiz) {
  const questions = [
    { title: 'An admin password appears in a breach. What helps most?', options: ['Hide the login URL', 'Use a unique password and MFA', 'Change the site logo'], answer: 1 },
    { title: 'A page displays text submitted by a visitor. What reduces XSS risk?', options: ['Encode untrusted output', 'Make the text smaller', 'Disable all logs'], answer: 0 },
    { title: 'A teammate no longer needs admin access. What should you do?', options: ['Leave it until the next redesign', 'Share the account with someone else', 'Remove unnecessary access'], answer: 2 },
    { title: 'How do you know a backup can help after an incident?', options: ['Check that the backup file exists', 'Test a restore', 'Keep it on the same server only'], answer: 1 }
  ];
  const form = document.createElement('form');
  questions.forEach((question, index) => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${String(index + 1).padStart(2, '0')} / ${question.title}`;
    fieldset.append(legend);
    question.options.forEach((option, choice) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `question-${index}`;
      input.value = String(choice);
      label.append(input, document.createTextNode(option));
      fieldset.append(label);
    });
    form.append(fieldset);
  });
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button-primary';
  submit.textContent = 'Check my answers ↗';
  const result = document.createElement('p');
  result.className = 'quiz-result';
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  form.append(submit, result);
  quiz.append(form);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const selections = questions.map((_, index) => form.querySelector(`input[name="question-${index}"]:checked`));
    if (selections.some(value => !value)) { result.textContent = 'Answer all four questions to see your score.'; return; }
    const score = selections.filter((value, index) => Number(value.value) === questions[index].answer).length;
    result.textContent = `${score} / 4 correct. ${score === 4 ? 'Excellent — you spotted every safer choice.' : 'Review the lessons and try again.'}`;
    window.sapienceAuth?.updateStudy('bestQuiz', null, score);
  });
}

const checks = [...document.querySelectorAll('input[data-check]')];
if (checks.length) {
  const storageKey = 'sapience-website-checklist-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { saved = {}; }
  checks.forEach(check => { check.checked = saved[check.dataset.check] === true; });
  const updateProgress = () => {
    const complete = checks.filter(check => check.checked).length;
    document.getElementById('progress-count').textContent = `${complete} / ${checks.length}`;
    document.getElementById('progress-fill').style.width = `${(complete / checks.length) * 100}%`;
    document.querySelector('.progress-track').setAttribute('aria-valuenow', String(complete));
  };
  checks.forEach(check => check.addEventListener('change', () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(checks.map(item => [item.dataset.check, item.checked]))));
    } catch { /* The checklist still works when browser storage is unavailable. */ }
    window.sapienceAuth?.update('checklist', check.dataset.check, check.checked);
    updateProgress();
  }));
  document.getElementById('reset-checklist')?.addEventListener('click', () => {
    checks.forEach(check => { check.checked = false; });
    try { localStorage.removeItem(storageKey); } catch { /* Keep the current page usable. */ }
    if (window.sapienceAuth?.user) window.sapienceAuth.replace('checklist', {});
    updateProgress();
  });
  document.addEventListener('sapience:authready', event => {
    checks.forEach(check => { check.checked = event.detail.checklist[check.dataset.check] === true; });
    updateProgress();
    const note = document.querySelector('.progress-card small');
    if (note) note.textContent = 'Synced to your account';
  });
  document.addEventListener('sapience:syncerror', () => {
    const note = document.querySelector('.progress-card small');
    if (note) note.textContent = 'Could not sync. Your changes remain on this device.';
  });
  updateProgress();
}

const resourceGrid = document.getElementById('resource-grid');
if (resourceGrid) {
  const featuredCards = [...resourceGrid.querySelectorAll('.resource-card')];
  const search = document.getElementById('resource-search');
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const moreButton = document.getElementById('resource-load-more');
  const count = document.getElementById('resource-count');
  const empty = document.getElementById('resource-empty');
  const note = document.getElementById('resource-note');
  let archive = null;
  let activeFilter = 'all';
  let shown = 12;
  const makeCard = item => {
    const card = document.createElement('a');
    card.className = 'resource-card';
    card.href = item.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const tag = document.createElement('span');
    tag.className = 'resource-tag';
    tag.textContent = item.category === 'web' ? 'WEB ATTACKS' : item.category === 'access' ? 'ACCESS' : 'RESEARCH';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const meta = document.createElement('p');
    meta.textContent = [item.author, item.date].filter(Boolean).join(' · ') || 'Original research';
    const open = document.createElement('span');
    open.className = 'resource-open';
    open.innerHTML = 'Read original <span aria-hidden="true">↗</span>';
    card.append(tag, title, meta, open);
    return card;
  };
  const renderResources = () => {
    const query = search.value.trim().toLocaleLowerCase();
    if (archive) {
      const matching = archive.filter(item =>
        (activeFilter === 'all' || item.category === activeFilter) &&
        (!query || [item.title, item.author, ...item.tags].join(' ').toLocaleLowerCase().includes(query))
      );
      resourceGrid.replaceChildren(...matching.slice(0, shown).map(makeCard));
      count.textContent = matching.length.toLocaleString();
      count.parentElement.lastChild.textContent = ' articles found';
      moreButton.hidden = matching.length <= shown;
      empty.hidden = matching.length !== 0;
    } else {
      let visible = 0;
      featuredCards.forEach(card => {
        card.hidden = !(activeFilter === 'all' || card.dataset.category === activeFilter) ||
          !card.textContent.toLocaleLowerCase().includes(query);
        if (!card.hidden) visible++;
      });
      count.textContent = String(visible);
      empty.hidden = visible !== 0;
    }
  };
  search.addEventListener('input', () => { shown = 12; renderResources(); });
  filterButtons.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    shown = 12;
    filterButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderResources();
  }));
  moreButton.addEventListener('click', () => { shown += 12; renderResources(); });
  fetch('./assets/research-index.json')
    .then(response => { if (!response.ok) throw new Error('Archive unavailable'); return response.json(); })
    .then(items => {
      archive = items.filter(item => {
        try { return ['http:', 'https:'].includes(new URL(item.url).protocol); }
        catch { return false; }
      });
      note.textContent = 'Archive includes research published from 2010 to 2024. Categories are broad guides based on the supplied tags.';
      renderResources();
    })
    .catch(() => {
      note.textContent = 'The full archive could not load. Featured articles remain available above.';
    });
}
