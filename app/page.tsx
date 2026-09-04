import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Smart Market Watchlist</h1>
      <p className="text-gray-600">
        Phase 1 foundation. Authentication and database schema only — no market
        data or watchlist features yet.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded bg-gray-900 px-4 py-2 text-white"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
