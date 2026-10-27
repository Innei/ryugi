interface Point {
  x: number;
  y: number;
}

export const HAND_PALM =
  'M9.2 14H23.4V19.5C23.4 24.5 21 27.6 17 27.6H15.6C12 27.6 9.2 25 9.2 21.5Z';

const CURLED: [
  baseX: number,
  baseY: number,
  width: number,
  open: number,
  curled: number,
  openAngle: number,
  curledAngle: number,
][] = [
  [14.5, 17.1, 3.3, 13.5, 7.8, 0, -4],
  [18.15, 16.9, 3.3, 12.5, 7.3, 3, 2],
  [21.75, 17.1, 3.2, 9.5, 6.3, 8, 4],
];

const INDEX = {
  from: { x: 10.85, y: 16.5 },
  control: [
    { x: 10.4, y: 12.1 },
    { x: 5.4, y: 9.2 },
  ],
  tip: [
    { x: 9.95, y: 7.7 },
    { x: 2.9, y: 16.6 },
  ],
};
const THUMB = {
  from: { x: 9.8, y: 23 },
  control: [
    { x: 7.25, y: 21.15 },
    { x: 4.2, y: 26.2 },
  ],
  tip: [
    { x: 4.7, y: 19.3 },
    { x: 3.3, y: 19.4 },
  ],
};

const round = (n: number) => Math.round(n * 100) / 100;
const mix = (a: number, b: number, t: number) => round(a + (b - a) * t);
const mixPoint = ([a, b]: Point[], t: number) => ({ x: mix(a!.x, b!.x, t), y: mix(a!.y, b!.y, t) });

function bend(finger: typeof INDEX, t: number) {
  const control = mixPoint(finger.control, t);
  const tip = mixPoint(finger.tip, t);
  const { from } = finger;
  return {
    from,
    control,
    tip,
    d: `M${from.x} ${from.y}Q${control.x} ${control.y} ${tip.x} ${tip.y}`,
  };
}

export function handPose(pinch: number, curl: number) {
  return {
    index: bend(INDEX, pinch),
    thumb: bend(THUMB, pinch),
    fingers: CURLED.map(([x, y, width, open, curled, openAngle, curledAngle]) => {
      const height = mix(open, curled, curl);
      return {
        x: x - width / 2,
        y: round(y - height),
        width,
        height,
        radius: width / 2,
        transform: `rotate(${mix(openAngle, curledAngle, curl)} ${x} ${y})`,
      };
    }),
    seam: Math.min(1, Math.max(0, pinch * 1.6)),
  };
}
