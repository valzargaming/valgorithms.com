(() => {
  const filters = [...document.querySelectorAll('[data-newsletter-filter]')];
  const entries = [...document.querySelectorAll('[data-newsletter-tags]')];
  if (!filters.length || !entries.length) return;

  const selected = () => new URLSearchParams(window.location.search).get('tag') || 'all';
  const apply = () => {
    const tag = selected();
    for (const button of filters) {
      const active = button.dataset.newsletterFilter === tag;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    for (const entry of entries) {
      const tags = (entry.dataset.newsletterTags || '').split(/\s+/).filter(Boolean);
      entry.hidden = tag !== 'all' && !tags.includes(tag);
    }
  };

  for (const button of filters) {
    button.addEventListener('click', () => {
      const url = new URL(window.location.href);
      const tag = button.dataset.newsletterFilter;
      tag === 'all' ? url.searchParams.delete('tag') : url.searchParams.set('tag', tag);
      history.pushState(null, '', url);
      apply();
    });
  }
  window.addEventListener('popstate', apply);
  apply();
})();
