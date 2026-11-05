/**
 * Visual treatment for a variant type's saved `color_code`.
 * The code comes from variant_types (the same values the type form stores).
 * These classes only render that code as a light tint plus darker text.
 */
export type VariantTypeTone = {
  section: string;
  border: string;
  icon: string;
  ring: string;
  title: string;
  pill: string;
  accent: string;
  muted: string;
};

const NEUTRAL: VariantTypeTone = {
  section: 'bg-[#F6F7FC]',
  border: 'border-[#E7E9F4]',
  icon: 'text-[#02066F]',
  ring: 'ring-[#02066F]/10',
  title: 'text-[#02066F]',
  pill: 'bg-white text-[#02066F] ring-[#02066F]/10',
  accent: 'bg-[#02066F]',
  muted: 'text-[#02066F]/55',
};

const TONES: Record<string, VariantTypeTone> = {
  blue: {
    section: 'bg-blue-50/80',
    border: 'border-blue-100',
    icon: 'text-blue-700',
    ring: 'ring-blue-200',
    title: 'text-blue-800',
    pill: 'bg-blue-100 text-blue-800 ring-blue-200',
    accent: 'bg-blue-700',
    muted: 'text-blue-800/60',
  },
  green: {
    section: 'bg-green-50/80',
    border: 'border-green-100',
    icon: 'text-green-700',
    ring: 'ring-green-200',
    title: 'text-green-800',
    pill: 'bg-green-100 text-green-800 ring-green-200',
    accent: 'bg-green-700',
    muted: 'text-green-800/60',
  },
  purple: {
    section: 'bg-purple-50/80',
    border: 'border-purple-100',
    icon: 'text-purple-700',
    ring: 'ring-purple-200',
    title: 'text-purple-800',
    pill: 'bg-purple-100 text-purple-800 ring-purple-200',
    accent: 'bg-purple-700',
    muted: 'text-purple-800/60',
  },
  orange: {
    section: 'bg-orange-50/80',
    border: 'border-orange-100',
    icon: 'text-orange-700',
    ring: 'ring-orange-200',
    title: 'text-orange-800',
    pill: 'bg-orange-100 text-orange-800 ring-orange-200',
    accent: 'bg-orange-700',
    muted: 'text-orange-800/60',
  },
  red: {
    section: 'bg-red-50/80',
    border: 'border-red-100',
    icon: 'text-red-700',
    ring: 'ring-red-200',
    title: 'text-red-800',
    pill: 'bg-red-100 text-red-800 ring-red-200',
    accent: 'bg-red-700',
    muted: 'text-red-800/60',
  },
  yellow: {
    section: 'bg-yellow-50/90',
    border: 'border-yellow-100',
    icon: 'text-yellow-800',
    ring: 'ring-yellow-200',
    title: 'text-yellow-900',
    pill: 'bg-yellow-100 text-yellow-900 ring-yellow-200',
    accent: 'bg-yellow-600',
    muted: 'text-yellow-900/60',
  },
  pink: {
    section: 'bg-pink-50/80',
    border: 'border-pink-100',
    icon: 'text-pink-700',
    ring: 'ring-pink-200',
    title: 'text-pink-800',
    pill: 'bg-pink-100 text-pink-800 ring-pink-200',
    accent: 'bg-pink-700',
    muted: 'text-pink-800/60',
  },
  indigo: {
    section: 'bg-indigo-50/80',
    border: 'border-indigo-100',
    icon: 'text-indigo-700',
    ring: 'ring-indigo-200',
    title: 'text-indigo-800',
    pill: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
    accent: 'bg-indigo-700',
    muted: 'text-indigo-800/60',
  },
  gray: {
    section: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'text-gray-700',
    ring: 'ring-gray-200',
    title: 'text-gray-800',
    pill: 'bg-gray-100 text-gray-800 ring-gray-200',
    accent: 'bg-gray-600',
    muted: 'text-gray-700/70',
  },
};

export function variantTypeTone(colorCode?: string | null): VariantTypeTone {
  const key = (colorCode || '').trim().toLowerCase();
  return TONES[key] || NEUTRAL;
}
