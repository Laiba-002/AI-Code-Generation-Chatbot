import { Code, Database, FileText, Globe, Palette } from "lucide-react";
import React, { useEffect, useState } from "react";
import { api } from "../utils/api";

// Helper function for blob requests with token refresh
const fetchWithTokenRefresh = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = localStorage.getItem("access_token");
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    } as HeadersInit,
    credentials: "include",
  });

  // If unauthorized and we have a token, try to refresh it
  if (response.status === 401 && token) {
    console.warn(
      "Authentication failed - attempting token refresh for blob request"
    );

    // Try to refresh token
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(
          "http://localhost:5000/api/auth/refresh",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
            credentials: "include",
          }
        );

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (data.success && data.tokens && data.tokens.access_token) {
            localStorage.setItem("access_token", data.tokens.access_token);
            console.log("Token refreshed successfully for blob request");

            // Retry the request with the new token
            return fetch(url, {
              ...options,
              headers: {
                ...options.headers,
                Authorization: `Bearer ${data.tokens.access_token}`,
              } as HeadersInit,
              credentials: "include",
            });
          }
        }
      } catch (error) {
        console.error("Token refresh failed for blob request:", error);
      }
    }
  }

  return response;
};

interface Artifact {
  id: string;
  type: string;
  title: string;
  language?: string;
  created_at: string;
  metadata: {
    name: string;
    description: string;
    executable: boolean;
  };
}

interface ArtifactListProps {
  onArtifactClick?: (artifactId: string) => void;
  selectedArtifactId?: string | null;
  savedArtifacts?: { [key: string]: any };
  onArtifactSaved?: (artifactId: string) => void;
}

const ArtifactList: React.FC<ArtifactListProps> = ({
  onArtifactClick,
  selectedArtifactId,
  savedArtifacts = {},
  onArtifactSaved,
}) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null
  );
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Fetch artifacts on component mount
  useEffect(() => {
    fetchArtifacts();
  }, []);

  const fetchArtifacts = async () => {
    try {
      setLoading(true);
      const data = await api.get("/artifacts");
      setArtifacts(data.artifacts || []);
    } catch (err) {
      setError("Failed to fetch artifacts");
    } finally {
      setLoading(false);
    }
  };

  const handleArtifactClick = async (artifact: Artifact) => {
    setSelectedArtifact(artifact);

    // If it's an executable artifact, show preview
    if (artifact.metadata.executable) {
      try {
        const response = await fetchWithTokenRefresh(
          `http://localhost:5000/api/artifacts/${artifact.id}/preview`
        );
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setShowPreview(true);
        }
      } catch (err) {
        console.error("Failed to load artifact preview:", err);
      }
    }

    // Call the callback if provided
    if (onArtifactClick) {
      onArtifactClick(artifact.id);
    }
  };

  const handleDownload = async (artifactId: string, title: string) => {
    try {
      const response = await fetchWithTokenRefresh(
        `http://localhost:5000/api/artifacts/${artifactId}/download`
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.${getFileExtension(artifactId)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to download artifact:", err);
    }
  };

  const getFileExtension = (artifactId: string) => {
    const artifact = artifacts.find((a) => a.id === artifactId);
    if (!artifact) return "txt";

    switch (artifact.type) {
      case "text/html":
        return "html";
      case "application/vnd.ant.code":
        return artifact.language || "txt";
      case "text/markdown":
        return "md";
      case "application/json":
        return "json";
      default:
        return "txt";
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "text/html":
        return <Globe className="w-6 h-6" />;
      case "application/vnd.ant.react":
        return <Code className="w-6 h-6" />;
      case "application/vnd.ant.code":
        return <Code className="w-6 h-6" />;
      case "text/markdown":
        return <FileText className="w-6 h-6" />;
      case "application/json":
        return <Database className="w-6 h-6" />;
      case "image/svg+xml":
        return <Palette className="w-6 h-6" />;
      default:
        return <FileText className="w-6 h-6" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-300 rounded w-3/4"></div>
          <div className="h-4 bg-gray-300 rounded w-1/2"></div>
          <div className="h-4 bg-gray-300 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <p>{error}</p>
        <button
          onClick={fetchArtifacts}
          className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No artifacts created yet.</p>
        <p className="text-sm">Create code artifacts to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold mb-4">Artifacts</h3>

      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className={`bg-white border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
            selectedArtifactId === artifact.id
              ? "border-blue-500 bg-blue-50 shadow-md"
              : "border-gray-200"
          }`}
          onClick={() => handleArtifactClick(artifact)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <div className="text-gray-600">
                {getArtifactIcon(artifact.type)}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">
                  {artifact.title}
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  {artifact.metadata.description}
                </p>

                <div className="flex items-center space-x-2 mt-2">
                  {artifact.language && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {artifact.language}
                    </span>
                  )}

                  {artifact.metadata.executable && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Executable
                    </span>
                  )}

                  <span className="text-xs text-gray-400">
                    {new Date(artifact.created_at).toLocaleDateString()}
                  </span>

                  {savedArtifacts[artifact.id] && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Saved
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(artifact.id, artifact.title);
                }}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Download"
              >
                📥
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Artifact Preview Modal */}
      {showPreview && selectedArtifact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-11/12 h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center space-x-2">
                <div className="text-gray-600">
                  {getArtifactIcon(selectedArtifact.type)}
                </div>
                <h3 className="text-lg font-semibold">
                  {selectedArtifact.title}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowPreview(false);
                  URL.revokeObjectURL(previewUrl);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <iframe
              src={previewUrl}
              className="flex-1 w-full"
              title="Artifact Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtifactList;
