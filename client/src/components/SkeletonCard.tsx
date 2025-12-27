export default function SkeletonCard() {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 animate-pulse shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
            </div>
            <div className="space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
            </div>
        </div>
    );
}
