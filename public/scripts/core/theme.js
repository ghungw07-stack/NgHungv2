// Theme controller: gradient (default), dark, night
(function () {
  const THEME_KEY = 'app_theme';
  const themes = ['theme-light', 'theme-dark', 'theme-gradient'];

  function applyTheme(themeClass) {
    const body = document.body;
    themes.forEach(t => body.classList.remove(t));
    if (themeClass) body.classList.add(themeClass);
    try { localStorage.setItem(THEME_KEY, themeClass || ''); } catch {}
  }

  function getSavedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'theme-light'; } catch { return 'theme-light'; }
  }

  function initTheme() {
    applyTheme(getSavedTheme());
    document.addEventListener('click', (e) => {
      const target = e.target.closest('#btnThemeLight, #btnThemeDark, #btnThemeGradient');
      if (!target) return;
      e.preventDefault();
      if (target.id === 'btnThemeLight') applyTheme('theme-light');
      if (target.id === 'btnThemeDark') applyTheme('theme-dark');
      if (target.id === 'btnThemeGradient') applyTheme('theme-gradient');
    });
  }

  document.addEventListener('DOMContentLoaded', initTheme);

  window.Theme = { applyTheme };
})();


