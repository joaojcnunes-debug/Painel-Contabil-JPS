export function PageLoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-64 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white border border-card-border rounded-xl p-5">
            <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-7 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-card-border rounded-xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="px-4 py-3 border-b border-card-border last:border-b-0"
          >
            <div className="h-4 w-3/4 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-1/2 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
