/**
 * Reveal on scroll: each section that opts in (data-reveal, its `reveal` setting) fades in (rises with expressive
 * motion) as it scrolls into view, and the items of its staggered grids (data-reveal-stagger) follow each other,
 * styled by .reveal and .reveal--visible in critical.css. A section in view on load, like the hero with the page's
 * largest image, is never hidden, so the first viewport never animates. Off under reduced motion.
 */
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const hide = (section) => {
    section.classList.add('reveal');
    for (const grid of section.querySelectorAll('[data-reveal-stagger]')) {
      [...grid.children].forEach((item, index) => item.style.setProperty('--reveal-order', Math.min(index, 8)));
    }
  };
  const observed = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!observed.has(target)) {
        observed.add(target);
        if (isIntersecting) observer.unobserve(target);
        else hide(target);
      } else if (isIntersecting) {
        target.classList.add('reveal--visible');
        observer.unobserve(target);
      }
    }
  });
  for (const section of document.querySelectorAll('main > .shopify-section:has(> [data-reveal])')) observer.observe(section);
}
