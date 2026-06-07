(() => {
  'use strict';

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 681px)');

  const isEnabled = () => (
    finePointer.matches &&
    desktop.matches &&
    !reducedMotion.matches
  );

  const layer1 = document.querySelector('.parallax-layer-1');
  const layer2 = document.querySelector('.parallax-layer-2');
  const layer3 = document.querySelector('.parallax-layer-3');
  
  if (!layer1 || !layer2 || !layer3) return;

  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let rafId = null;

  const animate = () => {
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;

    // Apply translations
    layer1.style.transform = `translate(${currentX * 10}px, ${currentY * 10}px)`;
    layer2.style.transform = `translate(${currentX * -15}px, ${currentY * -15}px)`;
    layer3.style.transform = `translate(${currentX * 25}px, ${currentY * 25}px)`;

    if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
      rafId = requestAnimationFrame(animate);
    } else {
      rafId = null;
    }
  };

  document.addEventListener('pointermove', (e) => {
    if (!isEnabled()) return;
    targetX = (e.clientX / window.innerWidth - 0.5); 
    targetY = (e.clientY / window.innerHeight - 0.5);
    
    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  });

  const reset = () => {
    targetX = 0;
    targetY = 0;
    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  };

  document.addEventListener('pointerleave', reset);

  const handlePreferenceChange = () => {
    if (!isEnabled()) {
      reset();
    }
  };

  finePointer.addEventListener('change', handlePreferenceChange);
  reducedMotion.addEventListener('change', handlePreferenceChange);
  desktop.addEventListener('change', handlePreferenceChange);
})();
