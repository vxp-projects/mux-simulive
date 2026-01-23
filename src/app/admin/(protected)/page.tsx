"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatTime } from "@/lib/simulive";
import AssetPicker from "@/components/AssetPicker";
import DateTimePicker from "@/components/DateTimePicker";

interface PlaylistItem {
  id: string;
  assetId: string;
  playbackId: string;
  playbackPolicy: string;
  duration: number;
  order: number;
}

interface Stream {
  id: string;
  slug: string;
  title: string;
  scheduledStart: string;
  isActive: boolean;
  syncInterval: number;
  driftTolerance: number;
  pollMultiplier: number;
  endedAt: string | null;
  loopCount: number;
  items: PlaylistItem[];
}

interface MuxAsset {
  id: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
  title: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [assets, setAssets] = useState<MuxAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [embedModal, setEmbedModal] = useState<Stream | null>(null);
  const [embedMode, setEmbedMode] = useState<"responsive" | "fixed">("responsive");
  const [embedSize, setEmbedSize] = useState<"small" | "medium" | "large" | "xl">("medium");
  const [editModal, setEditModal] = useState<Stream | null>(null);
  const [editData, setEditData] = useState({
    title: "",
    slug: "",
    scheduledStart: "",
    loopCount: 1,
    pollMultiplier: 1.0,
    assetIds: [] as string[],
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const embedSizes = {
    small: { width: 480, height: 270 },
    medium: { width: 640, height: 360 },
    large: { width: 854, height: 480 },
    xl: { width: 1280, height: 720 },
  };

  // Generate responsive or fixed embed code
  function getEmbedCode(slug: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (embedMode === "responsive") {
      return `<iframe
  src="${origin}/embed/${slug}"
  style="display: block; width: 100%; aspect-ratio: 16 / 9; border: 0;"
  allowfullscreen
  allow="autoplay; fullscreen"
></iframe>`;
    } else {
      const { width, height } = embedSizes[embedSize];
      return `<iframe
  src="${origin}/embed/${slug}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
></iframe>`;
    }
  }

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
    assetIds: [] as string[],
    scheduledStart: "",
    loopCount: 1,
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
      // Convert local datetime to ISO string (browser interprets datetime-local as local time)
      const scheduledStartISO = new Date(formData.scheduledStart).toISOString();

      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: formData.slug,
          title: formData.title,
          assetIds: formData.assetIds,
          scheduledStart: scheduledStartISO,
          loopCount: formData.loopCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create stream");
      }

      setStreams([data, ...streams]);
      setShowForm(false);
      setFormData({ slug: "", title: "", assetIds: [], scheduledStart: "", loopCount: 1 });
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

  // Stop stream for all viewers
  async function stopStream(stream: Stream) {
    if (!confirm(`Stop "${stream.title}" for all viewers? This will immediately end the broadcast.`)) return;

    try {
      const res = await fetch(`/api/streams/${stream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString() }),
      });

      if (!res.ok) throw new Error("Failed to stop stream");

      const updated = await res.json();
      setStreams(streams.map((s) => (s.id === stream.id ? updated : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop stream");
    }
  }

  // Resume a stopped stream
  async function resumeStream(stream: Stream) {
    try {
      const res = await fetch(`/api/streams/${stream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: null }),
      });

      if (!res.ok) throw new Error("Failed to resume stream");

      const updated = await res.json();
      setStreams(streams.map((s) => (s.id === stream.id ? updated : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resume stream");
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

  // Open edit modal with stream data
  function openEditModal(stream: Stream) {
    // Convert ISO date to local datetime format for the picker
    const scheduledDate = new Date(stream.scheduledStart);
    setEditData({
      title: stream.title,
      slug: stream.slug,
      scheduledStart: scheduledDate.toISOString(),
      loopCount: stream.loopCount,
      pollMultiplier: stream.pollMultiplier ?? 1.0,
      assetIds: stream.items.map((item) => item.assetId),
    });
    setEditError(null);
    setEditModal(stream);
  }

  // Handle edit form submission
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editModal) return;

    setEditError(null);
    setEditLoading(true);

    try {
      const scheduledStartISO = new Date(editData.scheduledStart).toISOString();

      const res = await fetch(`/api/streams/${editModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editData.title,
          slug: editData.slug,
          scheduledStart: scheduledStartISO,
          loopCount: editData.loopCount,
          pollMultiplier: editData.pollMultiplier,
          assetIds: editData.assetIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update stream");
      }

      setStreams(streams.map((s) => (s.id === editModal.id ? data : s)));
      setEditModal(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setEditLoading(false);
    }
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
          <Link
            href="/admin/audit"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg font-medium text-gray-300"
          >
            Audit Logs
          </Link>
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

            </div>

            {/* Date/Time Picker */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Scheduled Start
              </label>
              <DateTimePicker
                value={formData.scheduledStart}
                onChange={(value) =>
                  setFormData({ ...formData, scheduledStart: value })
                }
              />
            </div>

            {/* Asset Picker - Multiple Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Video Assets (Playlist)
              </label>
              <AssetPicker
                assets={assets}
                selectedAssetId={formData.assetIds[formData.assetIds.length - 1] || ""}
                onSelect={(assetId) => {
                  if (!formData.assetIds.includes(assetId)) {
                    setFormData({ ...formData, assetIds: [...formData.assetIds, assetId] });
                  }
                }}
              />
              {formData.assetIds.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-gray-400">Playlist order:</p>
                  {formData.assetIds.map((id, index) => {
                    const asset = assets.find(a => a.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2">
                        <span className="text-gray-500 w-6">{index + 1}.</span>
                        <span className="flex-1 truncate">{asset?.title || id}</span>
                        <span className="text-gray-500 text-sm">
                          {asset?.duration ? formatTime(asset.duration) : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            assetIds: formData.assetIds.filter((_, i) => i !== index)
                          })}
                          className="text-red-400 hover:text-red-300"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Loop Count */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Loop Count (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.loopCount}
                onChange={(e) => setFormData({
                  ...formData,
                  loopCount: Math.min(10, Math.max(1, parseInt(e.target.value) || 1))
                })}
                className="w-24 bg-gray-800 rounded px-3 py-2"
              />
              <p className="text-sm text-gray-500 mt-1">
                Playlist will play {formData.loopCount} time{formData.loopCount > 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={formLoading || formData.assetIds.length === 0}
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
            const isStopped = !!stream.endedAt;
            const playlistDuration = stream.items.reduce((sum, item) => sum + item.duration, 0);
            const totalDuration = playlistDuration * stream.loopCount;
            const isLive =
              stream.isActive &&
              !isStopped &&
              now >= scheduledDate &&
              now.getTime() - scheduledDate.getTime() < totalDuration * 1000;
            const hasEnded =
              isStopped || now.getTime() - scheduledDate.getTime() >= totalDuration * 1000;

            return (
              <div
                key={stream.id}
                data-testid="stream-row"
                data-stream-slug={stream.slug}
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
                    {isStopped && (
                      <span className="bg-orange-600 text-white text-xs px-2 py-1 rounded font-medium">
                        STOPPED
                      </span>
                    )}
                    {hasEnded && !isStopped && (
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
                      {formatTime(totalDuration)}
                      {stream.loopCount > 1 && (
                        <span className="text-gray-500 ml-1">
                          ({stream.items.length} video{stream.items.length > 1 ? "s" : ""} × {stream.loopCount} loops)
                        </span>
                      )}
                      {stream.loopCount === 1 && stream.items.length > 1 && (
                        <span className="text-gray-500 ml-1">
                          ({stream.items.length} videos)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/watch/${stream.slug}`}
                    target="_blank"
                    data-testid="preview-stream"
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"
                  >
                    Preview
                  </a>
                  <button
                    onClick={() => openEditModal(stream)}
                    data-testid="edit-stream"
                    className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setEmbedModal(stream)}
                    data-testid="embed-stream"
                    className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-sm"
                  >
                    Embed
                  </button>
                  {isLive && !isStopped && (
                    <button
                      onClick={() => stopStream(stream)}
                      data-testid="stop-stream"
                      className="bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded text-sm"
                    >
                      Stop
                    </button>
                  )}
                  {isStopped && (
                    <button
                      onClick={() => resumeStream(stream)}
                      data-testid="resume-stream"
                      className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => toggleActive(stream)}
                    data-testid={stream.isActive ? "deactivate-stream" : "activate-stream"}
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
                    data-testid="delete-stream"
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

      {/* Embed Code Modal */}
      {embedModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full" data-testid="embed-modal">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Embed Code</h2>
              <button
                onClick={() => setEmbedModal(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Copy this code to embed &ldquo;{embedModal.title}&rdquo; on your website:
            </p>
            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setEmbedMode("responsive")}
                data-testid="responsive-toggle"
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  embedMode === "responsive"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                Responsive
              </button>
              <button
                onClick={() => setEmbedMode("fixed")}
                data-testid="fixed-size-toggle"
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  embedMode === "fixed"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                Fixed Size
              </button>
            </div>
            {/* Fixed size options */}
            {embedMode === "fixed" && (
              <div className="flex gap-2 mb-4">
                {(["small", "medium", "large", "xl"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setEmbedSize(size)}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${
                      embedSize === size
                        ? "bg-purple-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {size === "xl" ? "XL" : size.charAt(0).toUpperCase() + size.slice(1)}
                    <span className="text-xs ml-1 opacity-70">
                      {embedSizes[size].width}x{embedSizes[size].height}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {embedMode === "responsive" && (
              <p className="text-gray-500 text-xs mb-4">
                The player will automatically fill its container while maintaining 16:9 aspect ratio.
              </p>
            )}
            <div className="bg-gray-800 rounded p-4 font-mono text-sm overflow-x-auto" data-testid="embed-code">
              <code className="text-green-400 whitespace-pre-wrap break-all">
                {getEmbedCode(embedModal.slug)}
              </code>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getEmbedCode(embedModal.slug));
                  alert("Embed code copied to clipboard!");
                }}
                data-testid="copy-embed"
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
              >
                Copy to Clipboard
              </button>
              <a
                href={`/embed/${embedModal.slug}`}
                target="_blank"
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-medium"
              >
                Preview Embed
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stream Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Edit Stream</h2>
              <button
                onClick={() => setEditModal(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleEdit} className="space-y-4">
              {editError && (
                <div className="bg-red-500/20 text-red-400 p-3 rounded">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={editData.title}
                    onChange={(e) =>
                      setEditData({ ...editData, title: e.target.value })
                    }
                    className="w-full bg-gray-800 rounded px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Slug (URL path)
                  </label>
                  <input
                    type="text"
                    value={editData.slug}
                    onChange={(e) =>
                      setEditData({ ...editData, slug: e.target.value })
                    }
                    className="w-full bg-gray-800 rounded px-3 py-2"
                    pattern="[a-z0-9-]+"
                    required
                  />
                </div>
              </div>

              {/* Date/Time Picker */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Scheduled Start
                </label>
                <DateTimePicker
                  value={editData.scheduledStart}
                  onChange={(value) =>
                    setEditData({ ...editData, scheduledStart: value })
                  }
                />
              </div>

              {/* Asset Picker - Multiple Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Video Assets (Playlist)
                </label>
                <AssetPicker
                  assets={assets}
                  selectedAssetId={editData.assetIds[editData.assetIds.length - 1] || ""}
                  onSelect={(assetId) => {
                    if (!editData.assetIds.includes(assetId)) {
                      setEditData({ ...editData, assetIds: [...editData.assetIds, assetId] });
                    }
                  }}
                />
                {editData.assetIds.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-400">Playlist order:</p>
                    {editData.assetIds.map((id, index) => {
                      const asset = assets.find((a) => a.id === id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2"
                        >
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="flex-1 truncate">
                            {asset?.title || id}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {asset?.duration ? formatTime(asset.duration) : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditData({
                                ...editData,
                                assetIds: editData.assetIds.filter(
                                  (_, i) => i !== index
                                ),
                              })
                            }
                            className="text-red-400 hover:text-red-300"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loop Count */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Loop Count (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editData.loopCount}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      loopCount: Math.min(
                        10,
                        Math.max(1, parseInt(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-24 bg-gray-800 rounded px-3 py-2"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Playlist will play {editData.loopCount} time
                  {editData.loopCount > 1 ? "s" : ""}
                </p>
              </div>

              {/* Poll Multiplier */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Poll Multiplier
                </label>
                <select
                  value={editData.pollMultiplier}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      pollMultiplier: parseFloat(e.target.value),
                    })
                  }
                  className="bg-gray-800 rounded px-3 py-2"
                >
                  <option value="0.25">0.25x (4x faster polling)</option>
                  <option value="0.5">0.5x (2x faster polling)</option>
                  <option value="1">1x (default)</option>
                  <option value="2">2x (slower polling)</option>
                  <option value="4">4x (much slower polling)</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Lower values = more frequent sync checks. Viewers receive updates live within ~3 minutes.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading || editData.assetIds.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded-lg font-medium"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
