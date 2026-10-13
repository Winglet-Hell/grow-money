import plugin from 'tailwindcss/plugin';

const withoutDefault = (values) => Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'DEFAULT'));

// The enter animations the components are written with — `animate-in fade-in slide-in-from-bottom-2
// duration-500`, `zoom-in-95` and so on, the class names of the tailwindcss-animate plugin. That
// plugin was never installed, so for a long time these classes did nothing. Only opacity and
// transform move, which the browser animates without laying the page out again.
const enterAnimations = plugin(({ addUtilities, matchUtilities, theme }) => {
  addUtilities({
    '@keyframes enter': {
      from: {
        opacity: 'var(--tw-enter-opacity, 1)',
        transform: 'translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1))',
      },
    },
    '.animate-in': {
      animationName: 'enter',
      animationDuration: '150ms',
      // A gentle ease-out. A steeper curve covered most of the way in the first frames, so
      // cards seemed to jump in.
      animationTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      // A delayed one waits in its starting pose instead of showing, vanishing and fading in.
      // Not `both`: a transform kept after the end would trap position: fixed children.
      animationFillMode: 'backwards',
      '--tw-enter-opacity': 'initial',
      '--tw-enter-scale': 'initial',
      '--tw-enter-translate-x': 'initial',
      '--tw-enter-translate-y': 'initial',
    },
  });
  matchUtilities({ 'fade-in': (value) => ({ '--tw-enter-opacity': value }) }, { values: { DEFAULT: '0', ...theme('opacity') } });
  matchUtilities({ 'zoom-in': (value) => ({ '--tw-enter-scale': value }) }, { values: { DEFAULT: '0', ...theme('scale') } });
  matchUtilities(
    {
      'slide-in-from-top': (value) => ({ '--tw-enter-translate-y': `-${value}` }),
      'slide-in-from-bottom': (value) => ({ '--tw-enter-translate-y': value }),
      'slide-in-from-left': (value) => ({ '--tw-enter-translate-x': `-${value}` }),
      'slide-in-from-right': (value) => ({ '--tw-enter-translate-x': value }),
    },
    { values: { DEFAULT: '100%', ...theme('translate') } }
  );
  // Pages that come in from the top down: `enter-cascade` on the page, `enter-row` on its row of
  // cards. What stands above the row enters at once, the cards one after another 70ms apart, and
  // everything below the row as one block a quarter of a second in. Each piece fades in and rises
  // 8px; the page itself doesn't fade, which would dim the cards together and hide the sequence.
  // Dialogs are portalled out of the page, and fixed elements are left alone.
  const enterPiece = (delay) => ({
    animationName: 'enter',
    animationDuration: '500ms',
    animationTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    animationFillMode: 'backwards',
    animationDelay: delay,
    '--tw-enter-opacity': '0',
    '--tw-enter-translate-y': '0.5rem',
    '--tw-enter-translate-x': 'initial',
    '--tw-enter-scale': 'initial',
  });
  addUtilities({
    '.enter-cascade > :not(.enter-row):not(.fixed)': enterPiece('0ms'),
    '.enter-cascade > .enter-row ~ :not(.fixed)': { animationDelay: '250ms' },
    '.enter-row > *': enterPiece('var(--enter-step, 0ms)'),
    '.enter-row > :nth-child(2)': { '--enter-step': '70ms' },
    '.enter-row > :nth-child(3)': { '--enter-step': '140ms' },
    '.enter-row > :nth-child(4)': { '--enter-step': '210ms' },
    '.enter-row > :nth-child(n+5)': { '--enter-step': '280ms' },
  });
  // duration-* and delay-* time transitions already; they time these animations too.
  matchUtilities({ duration: (value) => ({ animationDuration: value }) }, { values: withoutDefault(theme('transitionDuration')) });
  matchUtilities({ delay: (value) => ({ animationDelay: value }) }, { values: withoutDefault(theme('transitionDelay')) });
});

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [enterAnimations],
}
