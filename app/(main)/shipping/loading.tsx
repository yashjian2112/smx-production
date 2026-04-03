export default function ShippingLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-24 bg-zinc-800/60 rounded-lg" />
        ))}
      </div>
      {/* Cards */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <div className="h-4 w-28 bg-zinc-700 rounded" />
              <div className="h-5 w-20 bg-zinc-700 rounded-full" />
            </div>
            <div className="h-3 w-36 bg-zinc-700/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
