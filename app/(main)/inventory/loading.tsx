export default function InventoryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Search bar */}
      <div className="h-10 w-full bg-zinc-800/60 rounded-lg" />
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
            <div className="h-4 w-24 bg-zinc-700 rounded" />
            <div className="h-3 w-32 bg-zinc-700/60 rounded" />
            <div className="flex justify-between mt-1">
              <div className="h-5 w-14 bg-zinc-700/40 rounded" />
              <div className="h-5 w-14 bg-zinc-700/40 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
