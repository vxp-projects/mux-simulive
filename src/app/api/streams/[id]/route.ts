import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAssetInfo } from "@/lib/mux";
import { isApiAuthenticated, getClientIp } from "@/lib/auth";
import { deleteCached, isRedisConfigured } from "@/lib/redis";
import { logStreamUpdated, logStreamDeleted } from "@/lib/audit";

const STREAMS_CACHE_KEY = "streams:all";

async function invalidateStreamsCache() {
  await deleteCached(STREAMS_CACHE_KEY);
}

async function invalidateStatusCache(streamId: string, slug: string) {
  // Invalidate both ID and slug-based cache keys
  await Promise.all([
    deleteCached(`stream:${streamId}:status`),
    deleteCached(`stream:${slug}:status`),
  ]);
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/streams/[id] - Get a single stream
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const stream = await prisma.stream.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    return NextResponse.json(stream);
  } catch (error) {
    console.error("Failed to fetch stream:", error);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 500 }
    );
  }
}

// PATCH /api/streams/[id] - Update a stream
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: "Redis is required for admin authentication." },
      { status: 503 }
    );
  }

  if (!(await isApiAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Check if stream exists
    const existingStream = await prisma.stream.findUnique({ where: { id } });
    if (!existingStream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    // Only allow updating certain fields
    const allowedFields = [
      "title",
      "slug",
      "scheduledStart",
      "isActive",
      "syncInterval",
      "driftTolerance",
      "endedAt",
      "loopCount",
      "pollMultiplier",
    ];

    const updateData: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "scheduledStart") {
          updateData[field] = new Date(body[field]);
        } else if (field === "endedAt") {
          // endedAt can be null (to resume) or a date string (to stop)
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else if (field === "loopCount") {
          // loopCount must be between 1 and 10
          updateData[field] = Math.min(10, Math.max(1, body[field]));
        } else if (field === "pollMultiplier") {
          // pollMultiplier must be between 0.1 and 10
          updateData[field] = Math.min(10, Math.max(0.1, parseFloat(body[field]) || 1.0));
        } else {
          updateData[field] = body[field];
        }
        changedFields.push(field);
      }
    }

    // Validate slug if being updated
    if (updateData.slug && !/^[a-z0-9-]+$/.test(updateData.slug as string)) {
      return NextResponse.json(
        {
          error:
            "Slug must contain only lowercase letters, numbers, and hyphens",
        },
        { status: 400 }
      );
    }

    // Check slug uniqueness if being changed
    if (updateData.slug && updateData.slug !== existingStream.slug) {
      const slugExists = await prisma.stream.findUnique({
        where: { slug: updateData.slug as string },
      });
      if (slugExists) {
        return NextResponse.json(
          { error: "A stream with this slug already exists" },
          { status: 409 }
        );
      }
    }

    // Handle playlist update if assetIds provided
    if (body.assetIds && Array.isArray(body.assetIds) && body.assetIds.length > 0) {
      // Fetch asset info for all new assets
      const playlistItems: Array<{
        assetId: string;
        playbackId: string;
        playbackPolicy: string;
        duration: number;
        order: number;
      }> = [];

      for (let i = 0; i < body.assetIds.length; i++) {
        const assetId = body.assetIds[i];
        let assetInfo;
        try {
          assetInfo = await getAssetInfo(assetId);
        } catch (error) {
          console.error("Failed to fetch asset info:", error);
          return NextResponse.json(
            { error: `Failed to fetch asset ${i + 1} from Mux. Check that the Asset ID is correct.` },
            { status: 400 }
          );
        }

        if (!assetInfo.playbackId) {
          return NextResponse.json(
            { error: `Asset ${i + 1} does not have a public playback ID` },
            { status: 400 }
          );
        }

        if (assetInfo.status !== "ready") {
          return NextResponse.json(
            { error: `Asset ${i + 1} is not ready. Current status: ${assetInfo.status}` },
            { status: 400 }
          );
        }

        playlistItems.push({
          assetId,
          playbackId: assetInfo.playbackId,
          playbackPolicy: assetInfo.playbackPolicy || "public",
          duration: assetInfo.duration || 0,
          order: i,
        });
      }

      // Delete existing playlist items and create new ones in a transaction
      await prisma.$transaction([
        prisma.playlistItem.deleteMany({ where: { streamId: id } }),
        ...playlistItems.map((item) =>
          prisma.playlistItem.create({
            data: {
              streamId: id,
              ...item,
            },
          })
        ),
      ]);

      changedFields.push("playlist");
    }

    // Update the stream
    const stream = await prisma.stream.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          orderBy: { order: "asc" },
        },
      },
    });

    // Log stream update
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;
    await logStreamUpdated(clientIp, userAgent, {
      id: stream.id,
      title: stream.title,
      changes: changedFields,
    });

    // Invalidate caches after update
    await invalidateStreamsCache();

    // Invalidate status cache if endedAt, isActive, or pollMultiplier changed
    if (updateData.endedAt !== undefined || updateData.isActive !== undefined || updateData.pollMultiplier !== undefined) {
      await invalidateStatusCache(stream.id, stream.slug);
    }

    return NextResponse.json(stream);
  } catch (error) {
    console.error("Failed to update stream:", error);
    return NextResponse.json(
      { error: "Failed to update stream" },
      { status: 500 }
    );
  }
}

// DELETE /api/streams/[id] - Delete a stream
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: "Redis is required for admin authentication." },
      { status: 503 }
    );
  }

  if (!(await isApiAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Get stream info before deletion for logging
    const stream = await prisma.stream.findUnique({ where: { id } });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    await prisma.stream.delete({
      where: { id },
    });

    // Log stream deletion
    const clientIp = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || undefined;
    await logStreamDeleted(clientIp, userAgent, {
      id: stream.id,
      title: stream.title,
    });

    // Invalidate cache after delete
    await invalidateStreamsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete stream:", error);
    return NextResponse.json(
      { error: "Failed to delete stream" },
      { status: 500 }
    );
  }
}
