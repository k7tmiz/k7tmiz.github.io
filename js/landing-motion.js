(() => {
  'use strict';

  const root = document.documentElement;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 681px)');

  let frame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const isEnabled = () => (
    finePointer.matches &&
    desktop.matches &&
    !reducedMotion.matches
  );

  const setMotion = (x, y) => {
    root.style.setProperty('--motion-far-x', `${(x * 5).toFixed(2)}px`);
    root.style.setProperty('--motion-far-y', `${(y * 5).toFixed(2)}px`);
    root.style.setProperty('--motion-mid-x', `${(x * 9).toFixed(2)}px`);
    root.style.setProperty('--motion-mid-y', `${(y * 9).toFixed(2)}px`);
    root.style.setProperty('--motion-near-x', `${(x * 14).toFixed(2)}px`);
    root.style.setProperty('--motion-near-y', `${(y * 14).toFixed(2)}px`);
  };

  const animate = () => {
    currentX += (targetX - currentX) * 0.09;
    currentY += (targetY - currentY) * 0.09;
    setMotion(currentX, currentY);

    if (
      Math.abs(targetX - currentX) > 0.002 ||
      Math.abs(targetY - currentY) > 0.002
    ) {
      frame = requestAnimationFrame(animate);
    } else {
      currentX = targetX;
      currentY = targetY;
      setMotion(currentX, currentY);
      frame = 0;
    }
  };

  const requestUpdate = () => {
    if (!frame) {
      frame = requestAnimationFrame(animate);
    }
  };

  const reset = () => {
    targetX = 0;
    targetY = 0;
    requestUpdate();
  };

  const handlePointerMove = event => {
    if (!isEnabled()) {
      reset();
      return;
    }

    targetX = (event.clientX / window.innerWidth - 0.5) * 2;
    targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    requestUpdate();
  };

  const handlePreferenceChange = () => {
    if (!isEnabled()) {
      reset();
    }
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', reset);
  finePointer.addEventListener('change', handlePreferenceChange);
  reducedMotion.addEventListener('change', handlePreferenceChange);
  desktop.addEventListener('change', handlePreferenceChange);
})();
