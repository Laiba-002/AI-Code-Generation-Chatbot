import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Github,
  Link,
  Loader2,
  LogOut,
  Search,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import {
  GitHubContent,
  GitHubRepository,
  githubService,
  GitHubUser,
} from "../services/GitHubService";

interface GitHubContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelect: (files: SelectedFile[]) => void;
}

interface SelectedFile {
  path: string;
  name: string;
  type: "file" | "dir";
  size: number;
  percentage: number;
}

interface RepositoryFile extends GitHubContent {
  percentage: number;
  selected: boolean;
}

const GitHubContentModal: React.FC<GitHubContentModalProps> = ({
  isOpen,
  onClose,
  onFilesSelect,
}) => {
  // State management
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(
    null
  );
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCapacity, setTotalCapacity] = useState(0);
  const [usedCapacity, setUsedCapacity] = useState(0);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [currentUser, setCurrentUser] = useState<GitHubUser | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  // Check connection status and load data on component mount
  useEffect(() => {
    if (isOpen) {
      checkConnectionStatus();
    }
  }, [isOpen]);

  // Calculate capacity when selected files change
  useEffect(() => {
    const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    setUsedCapacity(total);

    // Update selected status for each file
    const updatedFiles = repositoryFiles.map((file) => {
      const selectedFile = selectedFiles.find((sf) => sf.path === file.path);
      return {
        ...file,
        selected: !!selectedFile,
      };
    });
    setRepositoryFiles(updatedFiles);
  }, [selectedFiles]);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await githubService.getRepositories(1, 100);
      setRepositories(result.repositories);
    } catch (error) {
      console.error("Error loading repositories:", error);
      setError("Failed to load repositories");
    } finally {
      setLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const status = await githubService.checkConnectionStatus();
      setIsConnected(status.connected);
      setCurrentUser(status.user || null);

      if (status.connected) {
        await loadRepositories();
      }
    } catch (error) {
      console.error("Error checking GitHub status:", error);
      setError("Failed to check GitHub connection status");
      setIsConnected(false);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    try {
      setLoading(true);
      setError(null);

      const success = await githubService.authenticateWithPopup();

      if (success) {
        await checkConnectionStatus();
      } else {
        setError("GitHub authentication failed");
      }
    } catch (error) {
      console.error("GitHub authentication error:", error);
      setError(
        error instanceof Error ? error.message : "Authentication failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadRepositoryContents = async (
    repo: GitHubRepository,
    path: string = ""
  ) => {
    try {
      // Set the selected repository immediately for instant UI feedback
      setSelectedRepo(repo);
      setCurrentPath(path);
      setLoading(true);
      setError(null);

      const result = await githubService.getRepositoryContents(
        repo.full_name,
        path
      );

      // Calculate total capacity (sum of all file sizes)
      const totalSize = result.contents.reduce(
        (sum, content) => sum + content.size,
        0
      );
      setTotalCapacity(totalSize);

      // Initialize files with percentage calculation based on total repository capacity
      const filesWithPercentage: RepositoryFile[] = result.contents.map(
        (content) => ({
          ...content,
          percentage: totalSize > 0 ? (content.size / totalSize) * 100 : 0,
          selected: false,
        })
      );

      setRepositoryFiles(filesWithPercentage);
      setSelectedFiles([]);
    } catch (error) {
      console.error("Error loading repository contents:", error);
      setError("Failed to load repository contents");
      // Reset selected repo on error
      setSelectedRepo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileToggle = (file: RepositoryFile) => {
    if (file.selected) {
      // Remove from selected files
      setSelectedFiles((prev) => prev.filter((f) => f.path !== file.path));
    } else {
      // Add to selected files
      const newSelectedFile: SelectedFile = {
        path: file.path,
        name: file.name,
        type: file.type,
        size: file.size,
        percentage: file.percentage, // Use the file's original percentage
      };
      setSelectedFiles((prev) => [...prev, newSelectedFile]);
    }
  };

  const handleFolderClick = (folder: RepositoryFile) => {
    if (folder.type === "dir" && selectedRepo) {
      const newPath = folder.path;
      setPathHistory((prev) => [...prev, currentPath]);
      loadRepositoryContents(selectedRepo, newPath);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (selectedRepo) {
      const targetPath = index === -1 ? "" : pathHistory[index];
      setPathHistory((prev) => prev.slice(0, index));
      loadRepositoryContents(selectedRepo, targetPath);
    }
  };

  const getBreadcrumbs = () => {
    const breadcrumbs = [];

    // Add root
    breadcrumbs.push({
      name: selectedRepo?.name || "Repository",
      path: "",
      isClickable: currentPath !== "",
    });

    // Add path segments
    if (currentPath) {
      const pathSegments = currentPath.split("/").filter(Boolean);
      let currentBreadcrumbPath = "";

      pathSegments.forEach((segment, index) => {
        currentBreadcrumbPath += (currentBreadcrumbPath ? "/" : "") + segment;
        breadcrumbs.push({
          name: segment,
          path: currentBreadcrumbPath,
          isClickable: index < pathSegments.length - 1,
        });
      });
    }

    return breadcrumbs;
  };

  const handleAddFiles = () => {
    if (selectedFiles.length > 0) {
      onFilesSelect(selectedFiles);
      onClose();
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      setError(null);

      const result = await githubService.disconnect();

      if (result.success) {
        // Clear all state and close modal
        setRepositories([]);
        setSelectedRepo(null);
        setRepositoryFiles([]);
        setSelectedFiles([]);
        setSearchQuery("");
        setCurrentUser(null);
        setIsConnected(false);
        setCurrentPath("");
        setPathHistory([]);
        onClose();
      } else {
        setError("Failed to disconnect GitHub account");
      }
    } catch (error) {
      console.error("Error disconnecting GitHub:", error);
      setError("Failed to disconnect GitHub account");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const filteredFiles = repositoryFiles.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPercentage = (percentage: number) => {
    if (percentage < 1) return "<1%";
    return `${Math.round(percentage)}%`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Add content from GitHub
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {currentUser ? (
                <>
                  Connected as{" "}
                  <span className="text-blue-400 font-medium">
                    {currentUser.login}
                  </span>{" "}
                  • Select the files you would like to add to this chat
                </>
              ) : (
                "Select the files you would like to add to this chat"
              )}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected && (
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Disconnect GitHub account"
              >
                {isDisconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>Disconnect</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Repository Selection Bar - Only show when connected */}
        {isConnected && (
          <div className="p-6 border-b border-gray-700">
            <div className="flex items-center space-x-4">
              {/* Repository Dropdown */}
              <div className="relative flex-1">
                <button
                  onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                  className="w-full flex items-center space-x-3 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white hover:bg-gray-600 transition-colors"
                >
                  <Github className="w-5 h-5 text-gray-400" />
                  <span className="flex-1 text-left">
                    {selectedRepo
                      ? selectedRepo.full_name
                      : "Select a repository"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {isRepoDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-10 max-h-60 github-modal-scrollbar">
                    {repositories.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => {
                          setCurrentPath("");
                          setPathHistory([]);
                          loadRepositoryContents(repo);
                          setIsRepoDropdownOpen(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-600 transition-colors"
                      >
                        <Github className="w-4 h-4 text-gray-400" />
                        <span className="text-white">{repo.full_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* URL Link Icon */}
              <button className="p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 transition-colors">
                <Link className="w-5 h-5" />
              </button>

              {/* Search Icon */}
              {selectedRepo && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 w-64"
                  />
                </div>
              )}
            </div>

            {/* Breadcrumb Navigation */}
            {selectedRepo && currentPath !== undefined && (
              <div className="mt-4 flex items-center space-x-2 text-sm">
                {getBreadcrumbs().map((breadcrumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <button
                      onClick={() => {
                        if (breadcrumb.isClickable) {
                          handleBreadcrumbClick(index - 1);
                        }
                      }}
                      className={`${
                        breadcrumb.isClickable
                          ? "text-blue-400 hover:text-blue-300 cursor-pointer"
                          : "text-gray-300 cursor-default"
                      } transition-colors`}
                    >
                      {breadcrumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg flex items-center space-x-2">
            <span className="text-red-200 text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Github className="w-16 h-16 text-gray-400 mb-6" />
              <h3 className="text-xl font-semibold text-white mb-4">
                Connect to GitHub
              </h3>
              <p className="text-gray-400 mb-8 max-w-md">
                Connect your GitHub account to browse repositories, view files,
                and import code directly into your conversations.
              </p>
              <button
                onClick={handleAuthenticate}
                disabled={loading}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Github className="w-5 h-5" />
                )}
                <span>{loading ? "Connecting..." : "Connect GitHub"}</span>
              </button>
            </div>
          ) : !selectedRepo ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Github className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-400">
                  Select a repository or paste a URL above to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full github-modal-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : (
                <div className="p-6">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.path}
                      className={`flex items-center space-x-3 p-3 hover:bg-gray-700 rounded-lg transition-colors ${
                        file.type === "dir" ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (file.type === "dir") {
                          handleFolderClick(file);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleFileToggle(file);
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      />

                      {file.type === "dir" ? (
                        <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      ) : (
                        <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">
                          {file.name}
                        </div>
                      </div>

                      <div className="text-gray-400 text-sm">
                        {formatPercentage(file.percentage)}
                      </div>
                    </div>
                  ))}

                  {filteredFiles.length === 0 && (
                    <div className="text-center text-gray-400 py-8">
                      No files found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Only show when connected */}
        {isConnected && (
          <div className="p-6 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <div className="text-gray-400 text-sm">
                Select files to add to chat context
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${(usedCapacity / totalCapacity) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-gray-400 text-sm">
                    {formatPercentage((usedCapacity / totalCapacity) * 100)} of
                    capacity used
                  </span>
                </div>

                <button
                  onClick={handleAddFiles}
                  disabled={selectedFiles.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  Add {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubContentModal;
