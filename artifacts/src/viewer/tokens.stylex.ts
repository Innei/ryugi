import * as stylex from '@stylexjs/stylex';

export const brand = stylex.defineVars({
  accent: '#c65d3b',
  accentStrong: '#b4512f',
});

export const motion = stylex.defineVars({
  ringAngle: stylex.types.angle('0deg'),
});
export const color = stylex.defineVars({
  selection: '#2f6fd6',
  selectionFill: 'rgb(47 111 214 / 0.12)',
  selectionWash: 'rgb(47 111 214 / 0.13)',
  selectionLine: 'rgb(47 111 214 / 0.35)',

  success: '#2ea043',
  successWash: 'rgba(0, 160, 63, 0.18)',
  danger: '#e5484d',

  warning: '#e8c24a',
  warningStrong: '#c9a03a',
  warningText: '#e5a54b',
  warningBar: 'rgba(240, 194, 75, 0.45)',
  warningEdge: 'rgba(240, 194, 75, 0.6)',
  warningSurface: 'rgba(240, 194, 75, 0.28)',
  warningWash: 'rgba(240, 194, 75, 0.2)',
  warningChip: 'rgba(232, 194, 74, 0.24)',

  human: '#2f6fd6',
  white: '#fff',
  black: '#000',
  onStrong: '#fff',
  ink: '#423d38',
  paper: '#fff',
  paperWarm: '#fff6db',
  inkWarm: '#3d2e00',

  mediaDeep: '#000',
  media: '#111',
  mediaRail: '#3a3a3a',
  mediaBorder: '#2a2a2a',
  mediaMuted: '#aaa',
  mediaOff: '#777',
  mediaHover: '#ddd',
  mediaMutedHover: '#bbb',
  resolved: '#3a3a3a',
  resolvedText: '#999',

  overlay: '#18181b',
  overlayActive: '#3f3f46',
  overlayText: '#e4e4e7',
  overlayShadow: 'rgba(24, 24, 27, 0.24)',
  overlayShadowSoft: 'rgba(24, 24, 27, 0.12)',
  overlayShadowHair: 'rgba(24, 24, 27, 0.05)',

  debug: 'rgba(0, 0, 0, 0.72)',
  debugText: '#e8e8e8',
  shadowSoft: 'rgba(0, 0, 0, 0.06)',
  shadowFaint: 'rgba(0, 0, 0, 0.03)',
  shadow: 'rgba(0, 0, 0, 0.14)',
  shadowPanel: 'rgba(0, 0, 0, 0.12)',
  shadowStrong: 'rgba(0, 0, 0, 0.22)',
  shadowHeavy: 'rgba(0, 0, 0, 0.25)',
  halo: 'rgba(255, 255, 255, 0.28)',
  haloStrong: 'rgba(255, 255, 255, 0.4)',
  mask: '#000',
});
