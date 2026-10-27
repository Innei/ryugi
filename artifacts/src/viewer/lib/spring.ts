export interface Spring {
  value: number;
  velocity: number;
}

export function stepSpring(
  { value, velocity }: Spring,
  target: number,
  dt: number,
  stiffness = 520,
  damping = 28,
): Spring {
  const next = velocity + (stiffness * (target - value) - damping * velocity) * dt;
  return { value: value + next * dt, velocity: next };
}
