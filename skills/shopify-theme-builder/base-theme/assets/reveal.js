/**
 * Reveal on scroll: each section of the page fades in (rises with expressive motion) as it scrolls into view,
 * styled by .reveal and .reveal--visible in critical.css. A section in view on load, like the hero with the
 * page's largest image, is never hidden, so the first viewport never animates. Off under reduced motion.
 */
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observed = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (!observed.has(target)) {
        observed.add(target);
        if (isIntersecting) observer.unobserve(target);
        else target.classList.add('reveal');
      } else if (isIntersecting) {
        target.classList.add('reveal--visible');
        observer.unobserve(target);
      }
    }
  });
  for (const section of document.querySelectorAll('main > .shopify-section')) observer.observe(section);
}
