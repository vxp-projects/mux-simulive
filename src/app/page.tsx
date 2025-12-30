import Link from "next/link";
import prisma from "@/lib/db";
import { formatTime } from "@/lib/simulive";

// Force dynamic rendering (database not available at build time)
export const dynamic = "force-dynamic";

export default async function Home() {
  // Get active streams
  const streams = await prisma.stream.findMany({
    where: { isActive: true },
    orderBy: { scheduledStart: "asc" },
  });

  const now = new Date();

  // Categorize streams
  const liveStreams = streams.filter((s) => {
    const start = new Date(s.scheduledStart);
    const elapsed = (now.getTime() - start.getTime()) / 1000;
    return elapsed >= 0 && elapsed < s.duration;
  });

  const upcomingStreams = streams.filter((s) => {
    const start = new Date(s.scheduledStart);
    return now < start;
  });

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-2">Live Streams</h1>
      <p className="text-gray-400 mb-8">Watch our synchronized broadcasts</p>

      {/* Live Now */}
      {liveStreams.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            Live Now
          </h2>
          <div className="grid gap-4">
            {liveStreams.map((stream) => (
              <Link
                key={stream.id}
                href={`/watch/${stream.slug}`}
                className="bg-gray-900 hover:bg-gray-800 rounded-lg p-6 block transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      {stream.title}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Duration: {formatTime(stream.duration)}
                    </p>
                  </div>
                  <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-medium">
                    LIVE
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcomingStreams.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Upcoming</h2>
          <div className="grid gap-4">
            {upcomingStreams.map((stream) => {
              const start = new Date(stream.scheduledStart);
              return (
                <div
                  key={stream.id}
                  className="bg-gray-900 rounded-lg p-6 block"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">
                        {stream.title}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        Starts: {start.toLocaleString()}
                      </p>
                      <p className="text-gray-400 text-sm">
                        Duration: {formatTime(stream.duration)}
                      </p>
                    </div>
                    <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded font-medium">
                      UPCOMING
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* No streams */}
      {streams.length === 0 && (
        <div className="bg-gray-900 rounded-lg p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">No Active Streams</h2>
          <p className="text-gray-400">Check back later for upcoming broadcasts.</p>
        </div>
      )}

      {/* Admin link */}
      <div className="mt-12 pt-8 border-t border-gray-800">
        <Link
          href="/admin"
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          Admin Dashboard →
        </Link>
      </div>
    </main>
  );
}
