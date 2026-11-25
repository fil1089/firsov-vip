(function () {
  'use strict';

  const widget = document.querySelector('[data-ask]');
  if (!widget) return;

  const hero = document.querySelector('.hero');
  const offer = document.querySelector('#offer');
  const close = widget.querySelector('[data-ask-close]');
  let dismissed = false;
  let heroVisible = true;
  let offerVisible = false;

  function sync() {
    widget.hidden = dismissed || heroVisible || offerVisible;
  }

  if (close) {
    close.addEventListener('click', function () {
      dismissed = true;
      sync();
    });
  }

  if ('IntersectionObserver' in window) {
    const watch = (element, update) => {
      if (!element) return;
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) update(entry.isIntersecting);
        sync();
      }, { threshold: 0.01 });
      observer.observe(element);
    };
    watch(hero, value => { heroVisible = value; });
    watch(offer, value => { offerVisible = value; });
  } else {
    let scheduled = false;
    const fallback = () => {
      scheduled = false;
      heroVisible = window.scrollY < window.innerHeight * 0.7;
      if (offer) {
        const rect = offer.getBoundingClientRect();
        offerVisible = rect.top < window.innerHeight && rect.bottom > 0;
      }
      sync();
    };
    window.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(fallback);
    }, { passive: true });
    fallback();
  }
})();
