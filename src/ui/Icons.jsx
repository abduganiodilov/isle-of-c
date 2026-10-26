// Small line-icon set (24×24, stroke = currentColor). Decorative by default;
// pass `title` to make an icon meaningful to screen readers.

const P = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13M8 7h7',
  flask: 'M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7.5 14h9',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm12 .5 5 5m0-5-5 5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  check: 'm4.5 12.5 5 5 10-11',
  stop: 'M6 6h12v12H6z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5',
  collapse: 'M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5',
  lock: 'M6 11h12v10H6V11Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4.5v1.5A3.5 3.5 0 0 0 8 11m8-5h3.5v1.5A3.5 3.5 0 0 1 16 11m-4 2v4m-4 4h8m-6.5 0 1-4h3l1 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 9a7.5 7.5 0 0 1 15 0',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  circle: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  half: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-16v16',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 3 3 5-6',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v4.5m0 3v.1',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  robot: 'M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Zm5-4v4M9.5 13v1.5m5-1.5v1.5M2 13v3m20-3v3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  left: 'M15 5 8 12l7 7',
  right: 'm9 5 7 7-7 7',
  pause: 'M8 5v14m8-14v14',
  rewind: 'M18 5 9 12l9 7V5ZM6 5v14',
  terminal: 'M4 5h16v14H4V5Zm3 4 3 3-3 3m5 0h5',
  search: 'm20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z',
  command: 'M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0h-6m6 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15Zm-6 0v2.5A2.5 2.5 0 1 1 6.5 15H9Z',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  upload: 'M12 20V9m0 0-4.5 4.5M12 9l4.5 4.5M5 4h14',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  cpu: 'M7 7h10v10H7V7Zm3 3h4v4h-4v-4ZM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
};

export default function Icon({ name, size = 16, title, className = '', strokeWidth = 1.8 }) {
  const d = P[name];
  if (!d) return null;
  const filled = name === 'play' || name === 'stop' || name === 'bolt';
  return (
    <svg
      className={`icon icon-${name} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export const STATUS_ICON = { locked: 'lock', available: 'circle', 'in-progress': 'half', completed: 'checkCircle', mastered: 'star' };
