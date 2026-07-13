(() => {
  'use strict';

  const MQ = window.matchMedia('(min-width: 992px)');
  const KEY = 'hexo-desktop-column-collapsed';

  const apply = () => {
    if (!MQ.matches) {
      document.body.classList.remove('desktop-column-collapsed');
      return;
    }
    const collapsed = localStorage.getItem(KEY) === '1';
    document.body.classList.toggle('desktop-column-collapsed', collapsed);
  };

  const toggle = (e) => {
    if (!MQ.matches) return;
    // 桌面端：接管按钮，切换左侧整栏
    e.preventDefault();
    e.stopImmediatePropagation();
    const next = !document.body.classList.contains('desktop-column-collapsed');
    document.body.classList.toggle('desktop-column-collapsed', next);
    localStorage.setItem(KEY, next ? '1' : '0');
  };

  const bind = () => {
    const btn = document.querySelector('.sidebar-toggle');
    if (!btn || btn.dataset.desktopBound === '1') return;
    btn.dataset.desktopBound = '1';
    btn.addEventListener('click', toggle, true);
    btn.setAttribute('aria-label', '切换侧边栏');
    btn.title = '切换侧边栏';
  };

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    bind();
  });

  MQ.addEventListener('change', apply);
})();
