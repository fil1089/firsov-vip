(function () {
  'use strict';

  const VERSION = 1;
  const DURATION_MS = 5 * 60 * 60 * 1000;
  const STORAGE_KEY = 'firsov-vip:personal-offer:v1';

  function validTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function isValidRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && value.version === VERSION
      && validTimestamp(value.startedAt) && validTimestamp(value.deadline)
      && validTimestamp(value.lastSeenAt)
      && value.deadline === value.startedAt + DURATION_MS
      && value.lastSeenAt >= value.startedAt
      && typeof value.expired === 'boolean';
  }

  function createRecord(now) {
    if (!validTimestamp(now) || !validTimestamp(now + DURATION_MS)) {
      throw new RangeError('Invalid offer start time');
    }
    return { version: VERSION, startedAt: now, deadline: now + DURATION_MS,
      lastSeenAt: now, expired: false };
  }

  function mergeRecords(first, second) {
    const earliest = first.deadline <= second.deadline ? first : second;
    return { ...earliest, lastSeenAt: Math.max(first.lastSeenAt, second.lastSeenAt),
      expired: first.expired || second.expired };
  }

  function advanceRecord(record, now) {
    return { ...record, lastSeenAt: Math.max(record.lastSeenAt, now),
      expired: record.expired || now >= record.deadline };
  }

  function effectiveTime(wall, monotonic, anchor, record) {
    if (!validTimestamp(wall) || !Number.isFinite(monotonic) || monotonic < 0) {
      throw new RangeError('Invalid clock reading');
    }
    const elapsed = Math.floor(Math.max(0, monotonic - anchor.monotonic));
    const result = Math.max(wall, record.lastSeenAt, anchor.epoch + elapsed);
    if (!validTimestamp(result)) throw new RangeError('Invalid elapsed time');
    return result;
  }

  function formatClock(remainingMs) {
    if (!Number.isFinite(remainingMs)) throw new RangeError('Invalid remaining time');
    const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    const pad = value => String(value).padStart(2, '0');
    return { hours: pad(Math.floor(seconds / 3600)),
      minutes: pad(Math.floor(seconds % 3600 / 60)), seconds: pad(seconds % 60) };
  }

  function readRecord(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { status: 'missing' };
      const record = JSON.parse(raw);
      return isValidRecord(record) ? { status: 'ready', record } : { status: 'unavailable' };
    } catch (_) {
      return { status: 'unavailable' };
    }
  }

  function saveRecord(storage, candidate) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      const observed = readRecord(storage);
      if (observed.status !== 'ready') return null;
      const merged = mergeRecords(candidate, observed.record);
      const encoded = JSON.stringify(merged);
      if (encoded !== JSON.stringify(observed.record)) storage.setItem(STORAGE_KEY, encoded);
      const verified = readRecord(storage);
      return verified.status === 'ready' && JSON.stringify(verified.record) === encoded
        ? merged : null;
    } catch (_) {
      return null;
    }
  }

  function createOfferController({ storage, now, monotonicNow }) {
    let record = null;
    let anchor = null;
    let initialized = false;
    let unavailable = false;

    function view() {
      if (unavailable || !record) return { status: 'unavailable', remainingMs: 0 };
      return { status: record.expired ? 'expired' : 'active',
        remainingMs: record.expired ? 0 : Math.max(0, record.deadline - record.lastSeenAt),
        record: { ...record } };
    }

    function fail() {
      unavailable = true;
      return view();
    }

    function commit(candidate, epoch, monotonic) {
      const saved = saveRecord(storage, advanceRecord(candidate, epoch));
      if (!saved) return fail();
      record = advanceRecord(saved, Math.max(epoch, saved.lastSeenAt));
      anchor = { epoch: record.lastSeenAt, monotonic };
      return view();
    }

    function start() {
      if (initialized) return refresh();
      initialized = true;
      try {
        const loaded = readRecord(storage);
        if (loaded.status === 'unavailable') return fail();
        const wall = now();
        const monotonic = monotonicNow();
        const initial = loaded.status === 'missing' ? createRecord(wall) : loaded.record;
        const origin = { epoch: Math.max(wall, initial.lastSeenAt), monotonic };
        const epoch = effectiveTime(wall, monotonic, origin, initial);
        return commit(initial, epoch, monotonic);
      } catch (_) {
        return fail();
      }
    }

    function refresh() {
      if (!initialized) return start();
      if (unavailable) return view();
      try {
        const loaded = readRecord(storage);
        if (loaded.status !== 'ready') return fail();
        const merged = mergeRecords(record, loaded.record);
        const monotonic = monotonicNow();
        const epoch = effectiveTime(now(), monotonic, anchor, merged);
        return commit(merged, epoch, monotonic);
      } catch (_) {
        return fail();
      }
    }

    return Object.freeze({ start, refresh });
  }

  function offerElements(root) {
    const names = ['discount', 'clock', 'terms', 'status', 'hours', 'minutes', 'seconds'];
    const result = {};
    for (const name of names) {
      result[name] = root.querySelector(`[data-offer-${name}]`);
      if (!result[name]) throw new Error(`Missing offer element: ${name}`);
    }
    return result;
  }

  function renderOffer(root, state) {
    const elements = offerElements(root);
    const active = state.status === 'active';
    root.setAttribute('data-offer-state', state.status);
    for (const name of ['discount', 'clock', 'terms']) elements[name].hidden = !active;
    elements.status.hidden = active;
    if (active) {
      const clock = formatClock(state.remainingMs);
      for (const name of ['hours', 'minutes', 'seconds']) elements[name].textContent = clock[name];
      elements.clock.setAttribute('aria-label',
        `До окончания предложения: ${clock.hours} часов, ${clock.minutes} минут, ${clock.seconds} секунд`);
    } else {
      elements.status.textContent = state.status === 'expired'
        ? 'Срок предложения завершён. Можно обсудить участие по обычной стоимости.'
        : 'Не удалось сохранить персональный срок в этом браузере. Уточните условия в личных сообщениях.';
    }
  }

  function mountOffer(root, browser, page) {
    let controller;
    try {
      controller = createOfferController({ storage: browser.localStorage,
        now: () => Date.now(), monotonicNow: () => browser.performance.now() });
    } catch (_) {
      renderOffer(root, { status: 'unavailable', remainingMs: 0 });
      return;
    }
    let interval = null;
    function refresh() {
      const state = controller.refresh();
      renderOffer(root, state);
      if (state.status !== 'active' && interval !== null) {
        browser.clearInterval(interval);
        interval = null;
      }
    }
    const initial = controller.start();
    renderOffer(root, initial);
    if (initial.status === 'active') interval = browser.setInterval(refresh, 1000);
    browser.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY || event.key === null) refresh();
    });
    browser.addEventListener('pagehide', refresh);
    page.addEventListener('visibilitychange', refresh);
  }

  const api = Object.freeze({ VERSION, DURATION_MS, STORAGE_KEY, isValidRecord, createRecord,
    mergeRecords, advanceRecord, effectiveTime, formatClock, createOfferController, renderOffer, mountOffer });
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  if (typeof document !== 'undefined') {
    const root = document.querySelector('[data-offer]');
    if (root) mountOffer(root, window, document);
  }
})();
