"use client";

import { useState } from "react";
import { formatTime } from "@/lib/simulive";

interface MuxAsset {
  id: string;
  playbackId: string | null;
  playbackPolicy: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
}

interface AssetPickerProps {
  assets: MuxAsset[];
  selectedAssetId: string;
  onSelect: (assetId: string) => void;
}

export default function AssetPicker({
  assets,
  selectedAssetId,
  onSelect,
}: AssetPickerProps) {
  const [previewAsset, setPreviewAsset] = useState<MuxAsset | null>(null);

  const readyAssets = assets.filter((a) => a.status === "ready" && a.playbackId);

  if (readyAssets.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
        <p>No assets found.</p>
        <p className="text-sm mt-2">Upload videos to your Mux account first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview Modal */}
      {previewAsset && previewAsset.playbackId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <div>
                <h3 className="font-semibold">Preview</h3>
                <p className="text-sm text-gray-400">
                  {previewAsset.id.slice(0, 12)}...
                  {previewAsset.duration && ` • ${formatTime(previewAsset.duration)}`}
                </p>
              </div>
              <button
                onClick={() => setPreviewAsset(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="aspect-video bg-black">
              <video
                src={`https://stream.mux.com/${previewAsset.playbackId}/high.mp4`}
                controls
                autoPlay
                className="w-full h-full"
              />
            </div>
            <div className="p-4 flex justify-end gap-3">
              <button
                onClick={() => setPreviewAsset(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onSelect(previewAsset.id);
                  setPreviewAsset(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Select This Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Grid */}
      <div className="max-h-80 overflow-y-auto bg-gray-800 rounded-lg p-2">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {readyAssets.map((asset) => {
            const isSelected = asset.id === selectedAssetId;
            const thumbnailUrl = asset.playbackId
              ? `https://image.mux.com/${asset.playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=smartcrop`
              : null;

            return (
              <div
                key={asset.id}
                className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                  isSelected
                    ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-800"
                    : "hover:ring-2 hover:ring-gray-500"
                }`}
                onClick={() => onSelect(asset.id)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gray-700">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={`Asset ${asset.id}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      No preview
                    </div>
                  )}
                </div>

                {/* Duration badge */}
                {asset.duration && (
                  <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                    {formatTime(asset.duration)}
                  </div>
                )}

                {/* Signed badge */}
                {asset.playbackPolicy === "signed" && (
                  <div className="absolute bottom-1 left-1 bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded">
                    Signed
                  </div>
                )}

                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                    ✓ Selected
                  </div>
                )}

                {/* Preview button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewAsset(asset);
                  }}
                  className="absolute top-1 left-1 bg-black/70 hover:bg-black text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity"
                  style={{ opacity: 1 }}
                >
                  ▶ Preview
                </button>

                {/* Asset ID */}
                <div className="p-2 bg-gray-900/90">
                  <p className="text-xs text-gray-400 truncate">
                    {asset.id.slice(0, 16)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected info */}
      {selectedAssetId && (
        <div className="text-sm text-gray-400">
          Selected: <span className="text-white font-mono">{selectedAssetId}</span>
        </div>
      )}
    </div>
  );
}
