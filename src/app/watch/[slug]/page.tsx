import { cache } from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import SimulatedLivePlayer from "@/components/SimulatedLivePlayer";

// Force dynamic rendering (database not available at build time)
export const dynamic = "force-dynamic";

// Cache the stream query to deduplicate between page and metadata
const getStream = cache(async (slug: string) => {
  return prisma.stream.findUnique({
    where: { slug },
  });
});

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function WatchPage({ params }: PageProps) {
  const { slug } = await params;

  const stream = await getStream(slug);

  if (!stream) {
    notFound();
  }

  // Check if stream is active
  if (!stream.isActive) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">Stream Unavailable</h1>
              <p className="text-gray-400">
                This stream is not currently active.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <SimulatedLivePlayer
          playbackId={stream.playbackId}
          playbackPolicy={stream.playbackPolicy}
          scheduledStart={stream.scheduledStart.toISOString()}
          videoDuration={stream.duration}
          title={stream.title}
          syncInterval={stream.syncInterval}
          driftTolerance={stream.driftTolerance}
        />
        <h1 className="text-2xl font-bold mt-6">{stream.title}</h1>
      </div>
    </main>
  );
}

// Generate metadata (uses cached getStream - no duplicate DB query)
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const stream = await getStream(slug);

  if (!stream) {
    return { title: "Stream Not Found" };
  }

  return {
    title: stream.title,
    description: `Watch ${stream.title} live`,
  };
}
