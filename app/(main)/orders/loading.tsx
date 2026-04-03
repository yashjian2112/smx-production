export default function OrdersLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 bg-zinc-700 rounded" />
        <div className="h-9 w-28 bg-zinc-700 rounded-lg" />
      </div>
      {/* Filter bar */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-20 bg-zinc-800/60 rounded-lg" />
        ))}
      </div>
      {/* Order cards */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <div className="h-4 w-28 bg-zinc-700 rounded" />
              <div className="h-5 w-16 bg-zinc-700 rounded-full" />
            </div>
            <div className="h-3 w-40 bg-zinc-700/60 rounded" />
            <div className="flex gap-2 mt-1">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-5 w-14 bg-zinc-700/40 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
