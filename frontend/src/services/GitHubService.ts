import { api } from '../utils/api';

/**
 * GitHub Integration Service
 * Handles GitHub authentication, repository browsing, and file fetching
 */

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email?: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  clone_url: string;
  language: string;
  stars: number;
  forks: number;
  updated_at: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  download_url?: string;
  html_url: string;
}

export interface GitHubFile {
  name: string;
  path: string;
  content: string;
  size: number;
  sha: string;
  encoding: string;
  download_url?: string;
  html_url: string;
}

export interface GitHubTree {
  repository: {
    name: string;
    full_name: string;
    description: string;
  };
  tree: Record<string, GitHubTreeNode>;
}

export interface GitHubTreeNode {
  type: 'file' | 'directory';
  path: string;
  size?: number;
  download_url?: string;
  children?: Record<string, GitHubTreeNode>;
}

export interface GitHubConnectionStatus {
  connected: boolean;
  user?: GitHubUser;
  success: boolean;
}

class GitHubService {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.NODE_ENV === 'production' ? '' : '';
  }

  // Removed getAuthToken method - now using centralized api authentication

  // Removed makeRequest method - now using centralized api.makeRequest with token refresh

  /**
   * Initialize GitHub OAuth authentication
   */
  async initiateAuth(): Promise<{ auth_url: string; state: string }> {
    try {
      const result = await api.get('/github/auth');
      
      if (!result.success) {
        throw new Error('Failed to initialize GitHub authentication');
      }

      return result;
    } catch (error) {
      console.error('GitHub auth initialization error:', error);
      throw error;
    }
  }

  /**
   * Open GitHub OAuth in popup window
   */
  async authenticateWithPopup(): Promise<boolean> {
    try {
      const { auth_url } = await this.initiateAuth();
      
      return new Promise((resolve, reject) => {
        // Open in a new tab instead of popup window
        const newTab = window.open(auth_url, '_blank');

        if (!newTab) {
          reject(new Error('Unable to open new tab. Please allow popups for this site.'));
          return;
        }

        // Listen for messages from the new tab
        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'github-auth-success') {
            window.removeEventListener('message', messageListener);
            resolve(true);
          } else if (event.data.type === 'github-auth-error') {
            window.removeEventListener('message', messageListener);
            reject(new Error(event.data.error || 'Authentication failed'));
          }
        };

        window.addEventListener('message', messageListener);

        // Also listen for focus events to check if user came back from the tab
        const checkFocus = () => {
          // Check if authentication was successful when user returns to the tab
          this.checkConnectionStatus().then((status) => {
            if (status.connected) {
              window.removeEventListener('message', messageListener);
              window.removeEventListener('focus', checkFocus);
              resolve(true);
            }
          }).catch(() => {
            // Continue waiting
          });
        };

        window.addEventListener('focus', checkFocus);

        // Timeout after 5 minutes
        setTimeout(() => {
          window.removeEventListener('message', messageListener);
          window.removeEventListener('focus', checkFocus);
          reject(new Error('Authentication timed out'));
        }, 5 * 60 * 1000);
      });
    } catch (error) {
      console.error('GitHub authentication error:', error);
      throw error;
    }
  }

  /**
   * Check GitHub connection status
   */
  async checkConnectionStatus(): Promise<GitHubConnectionStatus> {
    try {
      return await api.get('/github/status');
    } catch (error) {
      console.error('GitHub status check error:', error);
      return { connected: false, success: false };
    }
  }

  /**
   * Get user's repositories
   */
  async getRepositories(
    page: number = 1,
    perPage: number = 30,
    search?: string
  ): Promise<{ repositories: GitHubRepository[]; page: number; per_page: number }> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });

      if (search) {
        params.append('search', search);
      }

      return await api.get(`/github/repos?${params}`);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      throw error;
    }
  }

  /**
   * Get repository contents
   */
  async getRepositoryContents(
    repoFullName: string,
    path: string = ''
  ): Promise<{ contents: GitHubContent[]; repository: string; path: string }> {
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      return await api.get(`/github/repos/${encodeURIComponent(repoFullName)}/contents${params}`);
    } catch (error) {
      console.error('Error fetching repository contents:', error);
      throw error;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(
    repoFullName: string,
    filePath: string
  ): Promise<{ file: GitHubFile; repository: string }> {
    try {
      return await api.get(`/github/repos/${encodeURIComponent(repoFullName)}/files/${encodeURIComponent(filePath)}`);
    } catch (error) {
      console.error('Error fetching file content:', error);
      throw error;
    }
  }

  /**
   * Get repository file tree
   */
  async getRepositoryTree(
    repoFullName: string,
    maxDepth: number = 3
  ): Promise<{ tree: GitHubTree; repository: string }> {
    try {
      const params = `?max_depth=${maxDepth}`;
      return await api.get(`/github/repos/${encodeURIComponent(repoFullName)}/tree${params}`);
    } catch (error) {
      console.error('Error fetching repository tree:', error);
      throw error;
    }
  }

  /**
   * Import content from GitHub
   */
  async importContent(
    repository: string,
    filePath?: string,
    type: 'file' | 'repository' = 'file'
  ): Promise<{
    success: boolean;
    type: 'file' | 'repository';
    content?: string;
    filename?: string;
    tree?: GitHubTree;
    repository: string;
    file_path?: string;
  }> {
    try {
      const payload: any = {
        repository,
        type,
      };

      if (type === 'file' && filePath) {
        payload.file_path = filePath;
      }

      return await api.post('/github/import', payload);
    } catch (error) {
      console.error('Error importing from GitHub:', error);
      throw error;
    }
  }

  /**
   * Disconnect GitHub integration
   */
  async disconnect(): Promise<{ success: boolean; message: string }> {
    try {
      return await api.post('/github/disconnect', {});
    } catch (error) {
      console.error('Error disconnecting GitHub:', error);
      throw error;
    }
  }

  /**
   * Format file content for chat
   */
  formatFileForChat(file: GitHubFile, repository: string): string {
    const extension = file.name.split('.').pop() || '';
    const language = this.getLanguageFromExtension(extension);
    
    return `**File:** \`${file.name}\` from **${repository}**
**Path:** \`${file.path}\`
**Size:** ${this.formatFileSize(file.size)}

\`\`\`${language}
${file.content}
\`\`\`

---

Please analyze this code and help me understand or improve it.`;
  }

  /**
   * Format repository tree for chat
   */
  formatTreeForChat(tree: GitHubTree): string {
    const formatNode = (node: GitHubTreeNode, indent: string = ''): string => {
      let result = `${indent}${node.type === 'directory' ? '📁' : '📄'} ${node.path.split('/').pop()}\n`;
      
      if (node.children) {
        Object.values(node.children).forEach(child => {
          result += formatNode(child, indent + '  ');
        });
      }
      
      return result;
    };

    let content = `**Repository:** ${tree.repository.full_name}\n`;
    if (tree.repository.description) {
      content += `**Description:** ${tree.repository.description}\n`;
    }
    content += '\n**File Structure:**\n```\n';
    
    Object.values(tree.tree).forEach(node => {
      content += formatNode(node);
    });
    
    content += '```\n\n---\n\nPlease help me understand this repository structure or ask questions about specific files.';
    
    return content;
  }

  private getLanguageFromExtension(extension: string): string {
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'sql': 'sql',
      'r': 'r',
      'matlab': 'matlab',
      'tex': 'latex',
    };

    return languageMap[extension.toLowerCase()] || extension;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const githubService = new GitHubService();
