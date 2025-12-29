import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/streams/[id] - Get a single stream
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const stream = await prisma.stream.findUnique({
      where: { id },
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
  try {
    const { id } = await params;
    const body = await request.json();

    // Only allow updating certain fields
    const allowedFields = [
      "title",
      "slug",
      "scheduledStart",
      "isActive",
      "syncInterval",
      "driftTolerance",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "scheduledStart") {
          updateData[field] = new Date(body[field]);
        } else {
          updateData[field] = body[field];
        }
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

    const stream = await prisma.stream.update({
      where: { id },
      data: updateData,
    });

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
  try {
    const { id } = await params;
    await prisma.stream.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete stream:", error);
    return NextResponse.json(
      { error: "Failed to delete stream" },
      { status: 500 }
    );
  }
}
