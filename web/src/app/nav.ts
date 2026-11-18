import type { PictogramName } from '@shared/ui/Pictogram';

export const NAV: { to: string; label: string; icon: PictogramName }[] = [
  { to: '/', label: 'Журнал', icon: 'gauge' },
  { to: '/money', label: 'Деньги', icon: 'pump' },
  { to: '/members', label: 'Участники', icon: 'people' },
  { to: '/assistant', label: 'Ассистент', icon: 'key' },
];
