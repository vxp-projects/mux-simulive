"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/simulive";

interface Stream {
  id: string;
  slug: string;
  title: string;
  assetId: string;
  playbackId: string;
  duration: number;
  scheduledStart: string;
  isActive: boolean;
  syncInterval: number;
  driftTolerance: number;
}

interface MuxAsset {
  id: string;
  playbackId: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [assets, setAssets] = useState<MuxAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Logout handler
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  // Form state
  const [formData, setFormData] = useState({
    slug: "",
    title: "",
    assetId: "",
    scheduledStart: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Fetch streams and assets
  useEffect(() => {
    async function fetchData() {
      try {
        const [streamsRes, assetsRes] = await Promise.all([
          fetch("/api/streams"),
          fetch("/api/mux/assets"),
        ]);

        if (!streamsRes.ok) throw new Error("Failed to fetch streams");

        const streamsData = await streamsRes.json();
        setStreams(streamsData);

        if (assetsRes.ok) {
          const assetsData = await assetsRes.json();
          setAssets(assetsData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Create stream
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create stream");
      }

      setStreams([data, ...streams]);
      setShowForm(false);
      setFormData({ slug: "", title: "", assetId: "", scheduledStart: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setFormLoading(false);
    }
  }

  // Toggle stream active status
  async function toggleActive(stream: Stream) {
    try {
      const res = await fetch(`/api/streams/${stream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !stream.isActive }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updated = await res.json();
      setStreams(streams.map((s) => (s.id === stream.id ? updated : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  // Delete stream
  async function handleDelete(stream: Stream) {
    if (!confirm(`Delete "${stream.title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/streams/${stream.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      setStreams(streams.filter((s) => s.id !== stream.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  // Generate slug from title
  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Stream Management</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
          >
            {showForm ? "Cancel" : "+ New Stream"}
          </button>
          <button
            onClick={handleLogout}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium text-gray-300"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New Stream</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      title: e.target.value,
                      slug: generateSlug(e.target.value),
                    });
                  }}
                  className="w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="New Year's Eve 2024"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Slug (URL path)
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  className="w-full bg-gray-800 rounded px-3 py-2"
                  placeholder="new-years-eve-2024"
                  pattern="[a-z0-9-]+"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Mux Asset
                </label>
                <select
                  value={formData.assetId}
                  onChange={(e) =>
                    setFormData({ ...formData, assetId: e.target.value })
                  }
                  className="w-full bg-gray-800 rounded px-3 py-2"
                  required
                >
                  <option value="">Select an asset...</option>
                  {assets
                    .filter((a) => a.status === "ready" && a.playbackId)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.id.slice(0, 8)}... (
                        {asset.duration
                          ? formatTime(asset.duration)
                          : "unknown duration"}
                        )
                      </option>
                    ))}
                </select>
                {assets.length === 0 && (
                  <p className="text-gray-500 text-sm mt-1">
                    No assets found. Upload videos to your Mux account first.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Scheduled Start
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduledStart}
                  onChange={(e) =>
                    setFormData({ ...formData, scheduledStart: e.target.value })
                  }
                  className="w-full bg-gray-800 rounded px-3 py-2"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={formLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-6 py-2 rounded-lg font-medium"
              >
                {formLoading ? "Creating..." : "Create Stream"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Streams List */}
      <div className="space-y-4">
        {streams.length === 0 ? (
          <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-400">
            No streams yet. Create your first stream above.
          </div>
        ) : (
          streams.map((stream) => {
            const scheduledDate = new Date(stream.scheduledStart);
            const now = new Date();
            const isLive =
              stream.isActive &&
              now >= scheduledDate &&
              now.getTime() - scheduledDate.getTime() < stream.duration * 1000;
            const hasEnded =
              now.getTime() - scheduledDate.getTime() >= stream.duration * 1000;

            return (
              <div
                key={stream.id}
                className="bg-gray-900 rounded-lg p-6 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-semibold">{stream.title}</h3>
                    {stream.isActive && isLive && (
                      <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-medium">
                        LIVE NOW
                      </span>
                    )}
                    {stream.isActive && !isLive && !hasEnded && (
                      <span className="bg-yellow-600 text-white text-xs px-2 py-1 rounded font-medium">
                        SCHEDULED
                      </span>
                    )}
                    {hasEnded && (
                      <span className="bg-gray-600 text-white text-xs px-2 py-1 rounded font-medium">
                        ENDED
                      </span>
                    )}
                    {!stream.isActive && (
                      <span className="bg-gray-700 text-gray-400 text-xs px-2 py-1 rounded font-medium">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-sm space-y-1">
                    <p>
                      <span className="text-gray-500">URL:</span> /watch/
                      {stream.slug}
                    </p>
                    <p>
                      <span className="text-gray-500">Scheduled:</span>{" "}
                      {scheduledDate.toLocaleString()}
                    </p>
                    <p>
                      <span className="text-gray-500">Duration:</span>{" "}
                      {formatTime(stream.duration)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/watch/${stream.slug}`}
                    target="_blank"
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
                  >
                    Preview
                  </a>
                  <button
                    onClick={() => toggleActive(stream)}
                    className={`px-3 py-2 rounded text-sm ${
                      stream.isActive
                        ? "bg-yellow-600 hover:bg-yellow-700"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {stream.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => handleDelete(stream)}
                    className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
