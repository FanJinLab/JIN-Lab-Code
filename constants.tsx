
import React from 'react';

export const GROUP_COLORS = [
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#6366f1', // indigo
];

export const FIT_TEMPLATES = [
  { name: 'Exponential Decay', equation: 'a * exp(-k * t) + c' },
  { name: 'Logistic Growth', equation: 'L / (1 + exp(-k * (t - t0))) + c' },
  { name: 'Linear', equation: 'm * t + b' },
  { name: 'Double Exponential', equation: 'a1 * exp(-k1 * t) + a2 * exp(-k2 * t) + c' }
];
