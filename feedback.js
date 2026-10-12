const stage = document.getElementById('voice-stage');
if (stage) {
  let cards = [...stage.querySelectorAll('.voice-card')];
  let current = 0;
  let timer;
  const pause = document.getElementById('voice-pause');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !reducedMotion;
  const show = index => {
    current = (index + cards.length) % cards.length;
    cards.forEach((card, position) => { card.hidden = position !== current; });
    document.getElementById('voice-position').textContent = `${String(current + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
  };
  const schedule = () => {
    clearInterval(timer);
    if (playing && cards.length > 1) timer = setInterval(() => show(current + 1), 5500);
    pause.textContent = playing ? 'Pause' : 'Play';
    pause.setAttribute('aria-label', playing ? 'Pause feedback animation' : 'Play feedback animation');
  };
  document.getElementById('voice-prev').addEventListener('click', () => { show(current - 1); schedule(); });
  document.getElementById('voice-next').addEventListener('click', () => { show(current + 1); schedule(); });
  pause.addEventListener('click', () => { playing = !playing; schedule(); });
  show(0);
  schedule();

  fetch('/api/feedback', { credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Feedback unavailable'); return response.json(); })
    .then(({ items }) => {
      if (!Array.isArray(items) || !items.length) return;
      cards = items.map(item => {
        const card = document.createElement('article');
        card.className = 'voice-card';
        card.hidden = true;
        const kind = document.createElement('span');
        kind.className = 'voice-kind';
        kind.textContent = `LEARNER FEEDBACK · ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}`;
        const quote = document.createElement('blockquote');
        quote.textContent = `“${item.message}”`;
        const person = document.createElement('div');
        person.className = 'voice-person';
        const avatar = document.createElement('span');
        avatar.className = 'voice-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = item.name.slice(0, 1).toUpperCase();
        const name = document.createElement('span');
        name.textContent = item.name;
        person.append(avatar, name);
        card.append(kind, quote, person);
        return card;
      });
      stage.replaceChildren(...cards);
      stage.parentElement.setAttribute('aria-label', 'Learner feedback');
      document.getElementById('voices-title').innerHTML = 'What learners<br>are saying.';
      document.getElementById('voices-disclosure').textContent = 'Feedback submitted by Sapience learners and reviewed before publication.';
      show(0);
      schedule();
    })
    .catch(() => { /* Keep the clearly labeled examples visible. */ });

  const form = document.getElementById('feedback-form');
  const signIn = document.getElementById('feedback-signin');
  const status = document.getElementById('feedback-status');
  async function syncForm(user) {
    form.hidden = !user;
    signIn.hidden = !!user;
    if (!user) return;
    try {
      const response = await fetch('/api/my-feedback', { credentials: 'same-origin' });
      if (!response.ok) return;
      const { feedback } = await response.json();
      if (!feedback) return;
      form.elements.name.value = feedback.name;
      form.elements.rating.value = String(feedback.rating);
      form.elements.message.value = feedback.message;
      status.textContent = feedback.status === 'approved'
        ? 'Your feedback is published. Editing it sends it back for review.'
        : feedback.status === 'pending' ? 'Your feedback is awaiting review. You can edit it here.' : 'Your earlier feedback was not published. You can submit a revision.';
    } catch { /* The form is still usable. */ }
  }
  document.addEventListener('sapience:session', event => syncForm(event.detail.user));
  if (window.sapienceAuth?.user) syncForm(window.sapienceAuth.user);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending your feedback…';
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.elements.name.value.trim(), rating: Number(form.elements.rating.value), message: form.elements.message.value.trim(), consent: form.elements.consent.checked })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Feedback could not be sent.');
      status.textContent = 'Thank you. Your feedback is awaiting review before it appears publicly.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
