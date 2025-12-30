import { NextRequest, NextResponse } from "next/server";
import { listAssets } from "@/lib/mux";
import { isMuxConfigured } from "@/lib/config";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/mux/assets - List assets from Mux account (admin only)
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
    const assets = await listAssets();
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Failed to fetch Mux assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assets from Mux. Check your API credentials." },
      { status: 500 }
    );
  }
}
