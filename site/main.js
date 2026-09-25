const copyStatus = document.getElementById('copy-status')

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    const text = button.dataset.copy ?? button.previousElementSibling.textContent
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = 'Copied'
      copyStatus.textContent = 'Copied to the clipboard'
    } catch {
      button.textContent = 'Select and copy'
      copyStatus.textContent = 'Copying failed: select the text and copy it'
    }
    setTimeout(() => { button.textContent = 'Copy' }, 2000)
  })
}

// The demo loops for more than 5 seconds, so it gets a pause button (WCAG 2.2.2) and starts paused under reduced motion.
const video = document.querySelector('.hero__media video')
const pause = document.querySelector('[data-pause]')
const setPaused = (paused) => {
  if (paused) video.pause()
  else video.play().catch(() => {})
  pause.textContent = paused ? 'Play' : 'Pause'
  pause.setAttribute('aria-pressed', String(paused))
}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true)
pause.addEventListener('click', () => setPaused(!video.paused))
