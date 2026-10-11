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
    updateProgress();
  }));
  document.getElementById('reset-checklist')?.addEventListener('click', () => {
    checks.forEach(check => { check.checked = false; });
    try { localStorage.removeItem(storageKey); } catch { /* Keep the current page usable. */ }
    updateProgress();
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
