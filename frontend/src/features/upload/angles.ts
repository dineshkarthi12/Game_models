import type { Angle } from '@/types/api';
export const ANGLE_LABELS: Record<Angle, string> = {
  front: 'Front', back: 'Back', left: 'Left', right: 'Right', front_left: 'Front Left', front_right: 'Front Right',
  back_left: 'Back Left', back_right: 'Back Right', top: 'Top', bottom: 'Bottom', custom: 'Custom',
};
export const KEY_ANGLES: Angle[] = ['front', 'back', 'left', 'right', 'front_left', 'front_right', 'back_left', 'back_right', 'top', 'bottom'];
/** Azimuth in degrees (0 = front, clockwise seen from above) for the ring positions. */
export const AZIMUTH: Partial<Record<Angle, number>> = { front: 0, front_right: 45, right: 90, back_right: 135, back: 180, back_left: 225, left: 270, front_left: 315 };
