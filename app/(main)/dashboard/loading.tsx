export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
            <div className="h-3 w-16 bg-zinc-700 rounded" />
            <div className="h-7 w-12 bg-zinc-700 rounded" />
          </div>
        ))}
      </div>
      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 h-16" />
        ))}
      </div>
      {/* Content area */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 h-14" />
        ))}
      </div>
    </div>
  );
}
