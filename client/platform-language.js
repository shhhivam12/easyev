(function () {
  'use strict';

  const STORAGE_KEY = 'easyev-platform-language';
  const SUPPORTED = Object.freeze(['English', 'Hindi', 'Hinglish']);
  const DEFAULT_LANGUAGE = 'Hinglish';

  function normalize(value) {
    const match = SUPPORTED.find((language) => language.toLowerCase() === String(value || '').toLowerCase());
    return match || DEFAULT_LANGUAGE;
  }

  function get() {
    try {
      return normalize(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  function syncControls(language) {
    document.querySelectorAll('select[data-platform-language]').forEach((control) => {
      if (control.value !== language) control.value = language;
      control.setAttribute('aria-label', `Platform voice language: ${language}`);
    });
    document.querySelectorAll('[data-platform-language-label]').forEach((label) => {
      label.textContent = language === 'Hindi' ? 'हिंदी' : language;
    });
    document.querySelectorAll('[data-platform-language-option]').forEach((option) => {
      const selected = option.dataset.language === language;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', String(selected));
    });
    document.documentElement.dataset.platformLanguage = language;
  }

  function set(value, options = {}) {
    const language = normalize(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {}
    syncControls(language);
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('easyev:languagechange', { detail: { language } }));
    }
    return language;
  }

  function closeMenus() {
    document.querySelectorAll('[data-platform-language-menu]').forEach((menu) => {
      menu.hidden = true;
      menu.closest('.platform-language')?.classList.remove('is-open');
    });
    document.querySelectorAll('[data-platform-language-trigger]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function mount() {
    syncControls(get());
    document.addEventListener('click', (event) => {
      const option = event.target.closest?.('[data-platform-language-option]');
      if (option) {
        set(option.dataset.language);
        closeMenus();
        return;
      }

      const trigger = event.target.closest?.('[data-platform-language-trigger]');
      if (trigger) {
        const container = trigger.closest('.platform-language');
        const menu = container?.querySelector('[data-platform-language-menu]');
        const shouldOpen = Boolean(menu?.hidden);
        closeMenus();
        if (menu && shouldOpen) {
          menu.hidden = false;
          container.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      if (!event.target.closest?.('.platform-language')) closeMenus();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });
    document.addEventListener('change', (event) => {
      const control = event.target.closest?.('[data-platform-language]');
      if (control) set(control.value);
    });
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        const language = normalize(event.newValue);
        syncControls(language);
        window.dispatchEvent(new CustomEvent('easyev:languagechange', { detail: { language } }));
      }
    });
  }

  window.EasyEVLanguage = Object.freeze({
    get,
    set,
    supported: SUPPORTED,
    speechLocale(language = get()) {
      return normalize(language) === 'English' ? 'en-IN' : 'hi-IN';
    },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
