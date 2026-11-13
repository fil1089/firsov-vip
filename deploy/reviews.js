(() => {
  const gallery = document.querySelector('[data-review-gallery]');
  const dialog = document.querySelector('[data-review-dialog]');
  if (!gallery || !dialog) return;
  const thumbs = [...gallery.querySelectorAll('.review-thumb')];
  const count = gallery.querySelector('[data-review-count]');
  const dialogImage = dialog.querySelector('[data-review-dialog-image]');
  let active = 0;
  const show = (index, open = false) => {
    active = (index + thumbs.length) % thumbs.length;
    const current = thumbs[active];
    const src = current.dataset.reviewSrc;
    const alt = current.dataset.reviewAlt;
    dialogImage.src = src; dialogImage.alt = alt;
    count.textContent = `${String(active + 1).padStart(2, '0')} / ${String(thumbs.length).padStart(2, '0')}`;
    thumbs.forEach((thumb, i) => {
      const selected = i === active;
      thumb.classList.toggle('is-active', selected);
      thumb.setAttribute('aria-selected', String(selected));
    });
    current.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (open) dialog.showModal();
  };
  thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => show(index, true)));
  document.querySelectorAll('[data-review-direction]').forEach((button) => button.addEventListener('click', () => show(active + (button.dataset.reviewDirection === 'next' ? 1 : -1))));
  dialog.querySelector('[data-review-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
