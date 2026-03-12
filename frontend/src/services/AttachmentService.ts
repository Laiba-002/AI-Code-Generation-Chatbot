// Service for handling file attachments and integrations

import { api } from '../utils/api';

export interface FileUploadResponse {
  success: boolean;
  message: string;
  fileId?: string;
  content?: string;
  debug?: any;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  language: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}
export interface ScreenshotResult {
  success: boolean;
  blob?: Blob;
  url?: string;
  error?: string;
}
class AttachmentService {
  private baseURL: string;

  constructor() {
    // Determine the correct base URL for API calls
    this.baseURL = process.env.NODE_ENV === 'production' 
      ? '' // In production, API calls go to same origin
      : ''; // Use proxy in development
  }

  // Test server health
  async testHealth(): Promise<{ success: boolean; message: string }> {
    try {
      const url = 'http://127.0.0.1:5000/api/health';
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        message: `Server healthy: ${result.status}`
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  // Test file upload without authentication
  async testUpload(): Promise<{ success: boolean; message: string; debug?: any }> {
    try {
      console.log('=== TEST UPLOAD DEBUG ===');
      
      const url = 'http://127.0.0.1:5000/api/test-upload-simple';
      console.log(`Testing endpoint: ${url}`);
      
      // Create a simple test file
      const testContent = "This is a test file content for debugging.";
      const testFile = new File([testContent], "test.txt", { type: "text/plain" });
      
      const formData = new FormData();
      formData.append('file', testFile);
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      console.log(`Response status: ${response.status}`);
      console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Test upload failed:`, errorText);
        throw new Error(`Test upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log(`Test upload successful:`, result);
      
      return {
        success: true,
        message: `Test upload working: ${result.filename || 'file uploaded'}`,
        debug: { result }
      };
    } catch (error) {
      console.error('Test upload error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test upload failed',
        debug: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Test authentication
  async testAuth(): Promise<{ success: boolean; message: string }> {
    try {
      const url = 'http://127.0.0.1:5000/api/auth/profile';
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: 'Not authenticated (this is normal if not logged in)'
          };
        }
        throw new Error(`Auth test failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        success: true,
        message: `Auth working: ${result.message || 'authenticated'}`
      };
    } catch (error) {
      console.error('Auth test error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Auth test failed'
      };
    }
  }

  // File Upload - Main method
  async uploadFile(file: File): Promise<FileUploadResponse> {
    try {
      console.log('=== ATTACHMENT SERVICE UPLOAD DEBUG ===');
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });

      // Validate file
      if (!file || file.size === 0) {
        throw new Error('Invalid file or empty file');
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('FormData created with file');

      // Use direct endpoint to avoid proxy timeout issues
      const url = 'http://127.0.0.1:5000/api/upload';
      console.log(`Attempting upload to: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        mode: 'cors',
      });

      console.log(`Response status: ${response.status}`);
      console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Upload failed:`, errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Upload successful:', result);
      
      return {
        success: true,
        message: 'File uploaded successfully',
        fileId: result.fileId,
        content: result.content
      };

    } catch (error) {
      console.error('File upload error in service:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to upload file',
        debug: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

async takeScreenshot(): Promise<ScreenshotResult> {
  try {
    // Step 1: Create controller
    const controller = new CaptureController();

    // Step 2: Request screen/window capture with controller
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'window',
      },
      audio: false,
      selfBrowserSurface: 'exclude',
      controller, // Attach controller for no focus change
    } as any); // Casting because TS types may not yet include controller

    // Step 3: Try to prevent tab/window focus change
    try {
      controller.setFocusBehavior('no-focus-change');
    } catch (err) {
      console.warn("Focus behavior control not supported:", err);
    }

    // Step 4: Capture frame
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context not available");
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

    // Step 5: Convert to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b as Blob), "image/png");
    });

    // Step 6: Stop the capture
    stream.getTracks().forEach((t) => t.stop());
    track.stop();

    return {
      success: true,
      blob,
      url: URL.createObjectURL(blob)
    };
  } catch (error: any) {
    console.error("Screenshot error:", error);
    return { success: false, error: error.message };
  }
}

  // GitHub Integration
  async connectGitHub(): Promise<{ success: boolean; message: string; repos?: GitHubRepo[] }> {
    try {
      // Import the GitHub service
      const { githubService } = await import('./GitHubService');
      
      // Check if already connected
      const status = await githubService.checkConnectionStatus();
      if (status.connected) {
        return {
          success: true,
          message: 'GitHub already connected'
        };
      }
      
      // Initiate authentication
      const success = await githubService.authenticateWithPopup();
      
      if (success) {
        return {
          success: true,
          message: 'GitHub connected successfully'
        };
      } else {
        return {
          success: false,
          message: 'GitHub authentication failed'
        };
      }
    } catch (error) {
      console.error('GitHub connection error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to GitHub'
      };
    }
  }

  async getGitHubRepos(): Promise<GitHubRepo[]> {
    try {
      const response = await api.get('/github/repos');
      return response.repositories || response;
    } catch (error) {
      console.error('Error fetching GitHub repos:', error);
      return [];
    }
  }

  async importGitHubRepo(repoName: string, path?: string): Promise<FileUploadResponse> {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/github/import', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repo: repoName, path }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      const result = await response.json();
      return {
        success: true,
        message: 'Repository imported successfully',
        content: result.content
      };
    } catch (error) {
      console.error('GitHub import error:', error);
      return {
        success: false,
        message: 'Failed to import repository'
      };
    }
  }

  // Google Drive Integration
  async connectGoogleDrive(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Google Drive connection would be implemented here');
      return {
        success: true,
        message: 'Google Drive connected successfully'
      };
    } catch (error) {
      console.error('Google Drive connection error:', error);
      return {
        success: false,
        message: 'Failed to connect to Google Drive'
      };
    }
  }

  async getGoogleDriveFiles(): Promise<GoogleDriveFile[]> {
    try {
      const response = await api.get('/googledrive/files');
      return response.files || response;
    } catch (error) {
      console.error('Error fetching Google Drive files:', error);
      return [];
    }
  }

  async importGoogleDriveFile(fileId: string): Promise<FileUploadResponse> {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/googledrive/import', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      const result = await response.json();
      return {
        success: true,
        message: 'File imported successfully',
        content: result.content
      };
    } catch (error) {
      console.error('Google Drive import error:', error);
      return {
        success: false,
        message: 'Failed to import file'
      };
    }
  }

  // Voice Input
  async startVoiceRecording(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Voice recording would be implemented here');
      return {
        success: true,
        message: 'Voice recording started'
      };
    } catch (error) {
      console.error('Voice recording error:', error);
      return {
        success: false,
        message: 'Failed to start voice recording'
      };
    }
  }

  // Search functionality
  async searchContent(query: string): Promise<{ success: boolean; results: any[] }> {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/search', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const results = await response.json();
      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Search error:', error);
      return {
        success: false,
        results: []
      };
    }
  }

  // Project management
  async getProjects(): Promise<any[]> {
    try {
      const response = await api.get('/projects');
      return response.projects || response;
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  }

  async selectProject(projectId: string): Promise<FileUploadResponse> {
    try {
      const result = await api.post('/projects/select', { projectId });
      return {
        success: true,
        message: 'Project selected successfully',
        content: result.content
      };
    } catch (error) {
      console.error('Project selection error:', error);
      return {
        success: false,
        message: 'Failed to select project'
      };
    }
  }
}

export const attachmentService = new AttachmentService();