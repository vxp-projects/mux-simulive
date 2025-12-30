import { NextRequest, NextResponse } from "next/server";
import { listAssets, listAllAssets } from "@/lib/mux";
import { isMuxConfigured } from "@/lib/config";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/mux/assets - List assets from Mux account (admin only)
// Query params:
//   - limit: number (1-100, default 20) - items per page
//   - cursor: string - cursor for next page
//   - all: "true" - fetch all assets (default for backward compatibility)
export async function GET(request: NextRequest) {
  // Require admin authentication
  if (!(await isApiAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMuxConfigured()) {
    return NextResponse.json(
      { error: "Mux is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET environment variables." },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const cursor = searchParams.get("cursor") || undefined;
    const fetchAll = searchParams.get("all") !== "false"; // Default to all for backward compat

    // If limit is specified or all=false, use paginated mode
    if (limitParam || !fetchAll) {
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      const response = await listAssets(limit, cursor);
      return NextResponse.json(response);
    }

    // Default: fetch all assets (for admin asset picker)
    const assets = await listAllAssets();
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Failed to fetch Mux assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assets from Mux. Check your API credentials." },
      { status: 500 }
    );
  }
}
