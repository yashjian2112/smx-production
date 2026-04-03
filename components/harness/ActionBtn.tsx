'use client';

const COLOR_MAP: Record<string, string> = {
  sky:     'bg-sky-600/20 text-sky-400 border-sky-600/40 hover:bg-sky-600/30',
  amber:   'bg-amber-600/20 text-amber-400 border-amber-600/40 hover:bg-amber-600/30',
  emerald: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40 hover:bg-emerald-600/30',
  purple:  'bg-purple-600/20 text-purple-400 border-purple-600/40 hover:bg-purple-600/30',
  red:     'bg-red-600/20 text-red-400 border-red-600/40 hover:bg-red-600/30',
  orange:  'bg-orange-600/20 text-orange-400 border-orange-600/40 hover:bg-orange-600/30',
};

export function ActionBtn({
  label,
  color,
  loading,
  onClick,
  icon,
  disabled,
}: {
  label: string;
  color: string;
  loading?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${COLOR_MAP[color] || COLOR_MAP.sky}`}
    >
      {icon}
      {loading ? '...' : label}
    </button>
  );
}
