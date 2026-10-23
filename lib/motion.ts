import {useSyncExternalStore} from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

/**
 * Recharts animation props: a short ease-out fill, or none when the viewer prefers reduced
 * motion (Recharts does not read that setting itself). Spread onto Bar, Line or Pie.
 */
export function useChartAnimation() {
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
  return reduced
    ? {isAnimationActive: false}
    : {isAnimationActive: true, animationBegin: 0, animationDuration: 700, animationEasing: 'ease-out' as const};
}
