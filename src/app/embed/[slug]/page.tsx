import { cache } from "react";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import SimulatedLivePlayer from "@/components/SimulatedLivePlayer";

// ISR: Regenerate every 60 seconds
export const revalidate = 60;

const getStream = cache(async (slug: string) => {
  try {
    return await prisma.stream.findUnique({
      where: { slug },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch stream:", error);
    return null;
  }
});

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  const stream = await getStream(slug);

  if (!stream) {
    notFound();
  }

  if (!stream.isActive || stream.items.length === 0) {
    return (
      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Stream Unavailable</h1>
          <p className="text-gray-400 text-sm">
            This stream is not currently active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black overflow-hidden">
      <SimulatedLivePlayer
        items={stream.items}
        loopCount={stream.loopCount}
        scheduledStart={stream.scheduledStart.toISOString()}
        title={stream.title}
        syncInterval={stream.syncInterval}
        driftTolerance={stream.driftTolerance}
        embedded
        streamSlug={stream.slug}
        endedAt={stream.endedAt ? stream.endedAt.toISOString() : null}
        initialPollMultiplier={stream.pollMultiplier}
      />
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const stream = await getStream(slug);

  if (!stream) {
    return { title: "Stream Not Found" };
  }

  return {
    title: stream.title,
    description: `Watch ${stream.title}`,
  };
}
