"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AuditLog {
  id: string;
  timestamp: string;
  event: string;
  severity: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN_SUCCESS: { label: "Login Success", color: "bg-green-600" },
  LOGIN_FAILED: { label: "Login Failed", color: "bg-red-600" },
  LOGIN_RATE_LIMITED: { label: "Rate Limited", color: "bg-yellow-600" },
  LOGOUT: { label: "Logout", color: "bg-gray-600" },
  STREAM_CREATED: { label: "Stream Created", color: "bg-blue-600" },
  STREAM_UPDATED: { label: "Stream Updated", color: "bg-blue-500" },
  STREAM_DELETED: { label: "Stream Deleted", color: "bg-orange-600" },
};

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [eventFilter, setEventFilter] = useState<string>("");
  const [ipFilter, setIpFilter] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(0);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (eventFilter) params.set("event", eventFilter);
      if (ipFilter) params.set("ip", ipFilter);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`/api/admin/audit?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        throw new Error("Failed to fetch logs");
      }

      const data: AuditResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [eventFilter, ipFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(0);
  }, [eventFilter, ipFilter]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatUserAgent = (ua: string | null) => {
    if (!ua) return "Unknown";
    // Extract browser info
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return ua.slice(0, 30) + "...";
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-gray-400 mt-1">Track login attempts and security events</p>
        </div>
        <Link
          href="/admin"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Event Type</label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            >
              <option value="">All Events</option>
              <option value="LOGIN_SUCCESS">Login Success</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="LOGIN_RATE_LIMITED">Rate Limited</option>
              <option value="LOGOUT">Logout</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">IP Address</label>
            <input
              type="text"
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
              placeholder="Filter by IP..."
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setEventFilter("");
                setIpFilter("");
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition"
            >
              Clear Filters
            </button>
          </div>
          <div className="flex items-end ml-auto">
            <button
              onClick={fetchLogs}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-sm text-gray-400">Total Events</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">
            {logs.filter(l => l.event === "LOGIN_SUCCESS").length}
          </div>
          <div className="text-sm text-gray-400">Successful (this page)</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">
            {logs.filter(l => l.event === "LOGIN_FAILED").length}
          </div>
          <div className="text-sm text-gray-400">Failed (this page)</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {logs.filter(l => l.event === "LOGIN_RATE_LIMITED").length}
          </div>
          <div className="text-sm text-gray-400">Rate Limited (this page)</div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <div className="text-xl text-gray-400">Loading audit logs...</div>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <div className="text-xl text-gray-400">No audit logs found</div>
          <p className="text-gray-500 mt-2">
            {eventFilter || ipFilter ? "Try adjusting your filters" : "Events will appear here as they occur"}
          </p>
        </div>
      ) : (
        <>
          {/* Logs Table */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Event</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">IP Address</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Browser</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {logs.map((log) => {
                  const eventInfo = EVENT_LABELS[log.event] || { label: log.event, color: "bg-gray-600" };
                  return (
                    <tr key={log.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-sm">
                        <div className="text-white">{formatDate(log.timestamp)}</div>
                        <div className={`text-xs ${SEVERITY_COLORS[log.severity] || "text-gray-400"}`}>
                          {log.severity}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${eventInfo.color}`}>
                          {eventInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-300">
                        {log.ipAddress?.replace("::ffff:", "") || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatUserAgent(log.userAgent)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {log.details ? (
                          <span className="text-yellow-400">
                            {log.details.reason as string || JSON.stringify(log.details)}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-400">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-400">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
