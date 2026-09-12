// Apply before the stylesheet loads to avoid flashing the wrong saved theme.
(() => {
  const storageKey = 'werkstatt-theme';
  const themes = new Map([
    ['red', '#b82035'], ['green', '#163f34'], ['silver', '#59646f'],
    ['yellow', '#e3b62b'], ['grey', '#6b716a'], ['blue', '#253f63'],
  ]);
  const normalize = value => themes.has(value) ? value : 'red';
  function apply(value) {
    const theme = normalize(value);
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = themes.get(theme);
    const select = document.querySelector('#theme-select');
    if (select) select.value = theme;
  }
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch { /* Storage can be unavailable. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme-select');
    select.value = document.documentElement.dataset.theme;
    select.addEventListener('change', () => {
      apply(select.value);
      try { localStorage.setItem(storageKey, select.value); } catch { /* Switching still works. */ }
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) apply(event.newValue);
  });
})();
