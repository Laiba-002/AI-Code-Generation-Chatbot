import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Folder,
  File,
  Github,
  Star,
  GitFork,
  Clock,
  ChevronRight,
  ChevronDown,
  Download,
  ExternalLink,
  X,
  RefreshCw,
  User,
  Calendar,
  Code,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import {
  githubService,
  GitHubRepository,
  GitHubContent,
  GitHubFile,
  GitHubUser,
  GitHubTree,
  GitHubTreeNode
} from '../services/GitHubService';

interface GitHubBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (content: string) => void;
  onRepositorySelect: (content: string) => void;
}

type ViewMode = 'auth' | 'repositories' | 'contents' | 'file';

interface BreadcrumbItem {
  name: string;
  path: string;
}

const GitHubBrowser: React.FC<GitHubBrowserProps> = ({
  isOpen,
  onClose,
  onFileSelect,
  onRepositorySelect
}) => {
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('auth');
  const [isConnected, setIsConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [currentRepo, setCurrentRepo] = useState<GitHubRepository | null>(null);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Check connection status on component mount
  useEffect(() => {
    if (isOpen) {
      checkConnectionStatus();
    }
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  const checkConnectionStatus = async () => {
    try {
      setLoading(true);
      const status = await githubService.checkConnectionStatus();
      setIsConnected(status.connected);
      setGithubUser(status.user || null);
      
      if (status.connected) {
        setViewMode('repositories');
        await loadRepositories();
      } else {
        setViewMode('auth');
      }
    } catch (error) {
      console.error('Error checking GitHub status:', error);
      setError('Failed to check GitHub connection status');
      setViewMode('auth');
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
        setIsConnected(true);
        setViewMode('repositories');
        await checkConnectionStatus();
      } else {
        setError('GitHub authentication failed');
      }
    } catch (error) {
      console.error('GitHub authentication error:', error);
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const loadRepositories = async (searchTerm?: string, pageNum: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await githubService.getRepositories(pageNum, 30, searchTerm);
      
      if (pageNum === 1) {
        setRepositories(result.repositories);
      } else {
        setRepositories(prev => [...prev, ...result.repositories]);
      }
      
      setHasMore(result.repositories.length === 30);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading repositories:', error);
      setError('Failed to load repositories');
    } finally {
      setLoading(false);
    }
  };

  // Debounced search function
  const debouncedSearch = useCallback((query: string) => {
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      setPage(1);
      loadRepositories(query, 1);
    }, 300); // 300ms delay
    
    setSearchTimeout(timeout);
  }, [searchTimeout]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  };

  const loadRepositoryContents = async (repo: GitHubRepository, path: string = '') => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await githubService.getRepositoryContents(repo.full_name, path);
      setContents(result.contents);
      setCurrentRepo(repo);
      setCurrentPath(path);
      setViewMode('contents');
      
      // Update breadcrumbs
      const pathParts = path.split('/').filter(Boolean);
      const breadcrumbItems: BreadcrumbItem[] = [
        { name: repo.name, path: '' }
      ];
      
      let currentBreadcrumbPath = '';
      pathParts.forEach(part => {
        currentBreadcrumbPath += (currentBreadcrumbPath ? '/' : '') + part;
        breadcrumbItems.push({ name: part, path: currentBreadcrumbPath });
      });
      
      setBreadcrumbs(breadcrumbItems);
    } catch (error) {
      console.error('Error loading repository contents:', error);
      setError('Failed to load repository contents');
    } finally {
      setLoading(false);
    }
  };

  const handleContentClick = async (content: GitHubContent) => {
    if (content.type === 'dir') {
      await loadRepositoryContents(currentRepo!, content.path);
    } else {
      await loadFileContent(content);
    }
  };

  const loadFileContent = async (content: GitHubContent) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await githubService.getFileContent(currentRepo!.full_name, content.path);
      const formattedContent = githubService.formatFileForChat(result.file, currentRepo!.full_name);
      
      onFileSelect(formattedContent);
      onClose();
    } catch (error) {
      console.error('Error loading file content:', error);
      setError('Failed to load file content');
    } finally {
      setLoading(false);
    }
  };

  const handleImportRepository = async (repo: GitHubRepository) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await githubService.importContent(repo.full_name, undefined, 'repository');
      
      if (result.success && result.tree) {
        const formattedContent = githubService.formatTreeForChat(result.tree);
        onRepositorySelect(formattedContent);
        onClose();
      }
    } catch (error) {
      console.error('Error importing repository:', error);
      setError('Failed to import repository');
    } finally {
      setLoading(false);
    }
  };

  const handleBreadcrumbClick = (breadcrumb: BreadcrumbItem) => {
    if (currentRepo) {
      loadRepositoryContents(currentRepo, breadcrumb.path);
    }
  };

  const handleDisconnect = async () => {
    try {
      await githubService.disconnect();
      setIsConnected(false);
      setGithubUser(null);
      setViewMode('auth');
      setRepositories([]);
      setContents([]);
      setCurrentRepo(null);
      setCurrentPath('');
      setBreadcrumbs([]);
    } catch (error) {
      console.error('Error disconnecting GitHub:', error);
      setError('Failed to disconnect GitHub');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <Github className="w-6 h-6 text-white" />
            <h2 className="text-xl font-semibold text-white">Add content from GitHub</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-200 text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'auth' && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Github className="w-16 h-16 text-gray-400 mb-6" />
              <h3 className="text-xl font-semibold text-white mb-4">
                Connect to GitHub
              </h3>
              <p className="text-gray-400 mb-8 max-w-md">
                Connect your GitHub account to browse repositories, view files, and import code directly into your conversations.
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
                <span>{loading ? 'Connecting...' : 'Connect GitHub'}</span>
              </button>
            </div>
          )}

          {viewMode === 'repositories' && (
            <div className="flex flex-col h-full">
              {/* User info and search */}
              <div className="p-4 border-b border-gray-700">
                {githubUser && (
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <img
                        src={githubUser.avatar_url}
                        alt={githubUser.name}
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <div className="text-white font-medium">{githubUser.name}</div>
                        <div className="text-gray-400 text-sm">@{githubUser.login}</div>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="text-gray-400 hover:text-red-400 text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Repository list */}
              <div className="flex-1 overflow-y-auto">
                {loading && repositories.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {repositories.map((repo) => (
                      <div
                        key={repo.id}
                        className="bg-gray-700 rounded-lg p-4 hover:bg-gray-600 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              <h3 className="text-white font-medium truncate">
                                {repo.name}
                              </h3>
                              {repo.private && (
                                <span className="text-xs bg-yellow-600 text-yellow-100 px-2 py-1 rounded">
                                  Private
                                </span>
                              )}
                            </div>
                            
                            {repo.description && (
                              <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                                {repo.description}
                              </p>
                            )}
                            
                            <div className="flex items-center space-x-4 text-sm text-gray-400">
                              {repo.language && (
                                <div className="flex items-center space-x-1">
                                  <Code className="w-4 h-4" />
                                  <span>{repo.language}</span>
                                </div>
                              )}
                              <div className="flex items-center space-x-1">
                                <Star className="w-4 h-4" />
                                <span>{repo.stars}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <GitFork className="w-4 h-4" />
                                <span>{repo.forks}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>{formatDate(repo.updated_at)}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => handleImportRepository(repo)}
                              className="text-blue-400 hover:text-blue-300 p-2 rounded"
                              title="Import repository structure"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => loadRepositoryContents(repo)}
                              className="text-green-400 hover:text-green-300 p-2 rounded"
                              title="Browse files"
                            >
                              <Folder className="w-4 h-4" />
                            </button>
                            <a
                              href={repo.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-white p-2 rounded"
                              title="Open on GitHub"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {hasMore && !loading && (
                      <button
                        onClick={() => loadRepositories(searchQuery, page + 1)}
                        className="w-full py-3 text-blue-400 hover:text-blue-300 text-center"
                      >
                        Load more repositories
                      </button>
                    )}
                    
                    {loading && repositories.length > 0 && (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'contents' && currentRepo && (
            <div className="flex flex-col h-full">
              {/* Breadcrumbs */}
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center space-x-2 mb-2">
                  <button
                    onClick={() => setViewMode('repositories')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    ← Back to repositories
                  </button>
                </div>
                
                <div className="flex items-center space-x-2 text-sm">
                  {breadcrumbs.map((breadcrumb, index) => (
                    <React.Fragment key={breadcrumb.path}>
                      {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <button
                        onClick={() => handleBreadcrumbClick(breadcrumb)}
                        className={`${
                          index === breadcrumbs.length - 1
                            ? 'text-white font-medium'
                            : 'text-blue-400 hover:text-blue-300'
                        }`}
                      >
                        {breadcrumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Contents list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  </div>
                ) : (
                  <div className="p-4">
                    {contents.map((content) => (
                      <button
                        key={content.path}
                        onClick={() => handleContentClick(content)}
                        className="w-full flex items-center space-x-3 p-3 hover:bg-gray-700 rounded-lg transition-colors text-left"
                      >
                        {content.type === 'dir' ? (
                          <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        ) : (
                          <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">
                            {content.name}
                          </div>
                          {content.type === 'file' && (
                            <div className="text-gray-400 text-sm">
                              {formatFileSize(content.size)}
                            </div>
                          )}
                        </div>
                        {content.type === 'dir' && (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    ))}
                    
                    {contents.length === 0 && (
                      <div className="text-center text-gray-400 py-8">
                        This directory is empty
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubBrowser;
