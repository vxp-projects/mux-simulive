import { NextResponse } from "next/server";
import { listAssets } from "@/lib/mux";

// GET /api/mux/assets - List assets from Mux account
export async function GET() {
  try {
    const assets = await listAssets(50);
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Failed to fetch Mux assets:", error);
    return NextResponse.json(
      { error: "Failed to fetch assets from Mux" },
      { status: 500 }
    );
  }
}
