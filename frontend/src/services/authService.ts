import api from '../utils/api';

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
  last_login: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  error?: string;
}

export interface ChatSession {
  id: number;
  title: string;
  model_used: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  model_used?: string;
  timestamp: string;
}

class AuthService {
  private user: User | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private profileCallInProgress: boolean = false;

  constructor() {
    // Load tokens from localStorage on initialization
    this.loadTokensFromStorage();
  }

  private loadTokensFromStorage() {
    try {
      const userStr = localStorage.getItem('user');
      const accessToken = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      
      // Load tokens if they exist (user data can be fetched later)
      if (accessToken && refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;        
        // Load user data if available
        if (userStr) {
          this.user = JSON.parse(userStr);
        }
      }
    } catch (error) {
      console.error('Error loading tokens from storage:', error);
      this.clearStorage();
    }
  }

  public reloadTokensFromStorage() {
    this.loadTokensFromStorage();
  }

  private saveTokensToStorage(user: User, tokens: { access_token: string; refresh_token: string }) {
    try {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('refresh_token', tokens.refresh_token);
      this.user = user;
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
    } catch (error) {
      console.error('Error saving tokens to storage:', error);
    }
  }

  private clearStorage() {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async register(email: string, username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/register', {
        email,
        username,
        password
      });

      return response;
    } catch (error: any) {
      return {
        success: false,
        message: 'Registration failed',
        error: error.message || 'Registration failed'
      };
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/login', {
        email,
        password
      });

      if (response.success && response.user && response.tokens) {
        // Save user data and JWT tokens
        this.saveTokensToStorage(response.user, response.tokens);
      }

      return response;
    } catch (error: any) {
      return {
        success: false,
        message: 'Login failed',
        error: error.message || 'Login failed'
      };
    }
  }

  async logout(): Promise<boolean> {
    try {
      // For now, just clear storage since the API doesn't support custom headers easily
      // In a production app, you'd want to properly revoke the token on the server
      this.clearStorage();
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      this.clearStorage();
      return true; // Always clear local storage
    }
  }

  async getProfile(): Promise<User | null> {
    try {
      // Prevent multiple simultaneous calls
      if (this.profileCallInProgress) {
        console.log('🔍 Profile call already in progress, skipping...');
        return this.user; // Return cached user if available
      }

      // For JWT-based authentication, we need to verify the token with the server
      if (!this.accessToken) {
        console.log('🔍 No access token available');
        return null;
      }
      
      this.profileCallInProgress = true;
      console.log('🔍 Making profile API call...');
      
      // Make API call to verify token and get user profile with Authorization header
      const data = await api.get('/auth/profile');
      
      if (data.success && data.user) {
        this.user = data.user;
        // Save user to localStorage
        localStorage.setItem('user', JSON.stringify(this.user));
        console.log('🔍 Profile API call successful, user:', this.user?.username);
        return this.user;
      }
      return null;
    } catch (error) {
      console.error('Get profile error:', error);
      return null;
    } finally {
      this.profileCallInProgress = false;
    }
  }

  async verifyOAuthUser(): Promise<User | null> {
    // For OAuth verification, we need to check with the backend
    // This method is used when we don't have tokens yet (fallback for old OAuth flow)
    try {
      const data = await api.get('/auth/profile');
      
      if (data.success && data.user) {
        this.user = data.user;
        // For OAuth users, we don't have tokens yet, so just save user info
        localStorage.setItem('user', JSON.stringify(this.user));
        return this.user;
      }
      return null;
    } catch (error) {
      console.error('OAuth verification error:', error);
      return null;
    }
  }

  async getChatSessions(): Promise<ChatSession[]> {
    try {
      const response = await api.get('/sessions');
      if (response.success) {
        return response.sessions;
      }
      return [];
    } catch (error) {
      console.error('Get sessions error:', error);
      return [];
    }
  }

  async createChatSession(model: string = 'qwen2.5:8b'): Promise<number | null> {
    try {
      const response = await api.post('/sessions', { model });
      if (response.success) {
        return response.session_id;
      }
      return null;
    } catch (error) {
      console.error('Create session error:', error);
      return null;
    }
  }

  async getSessionMessages(sessionId: number): Promise<{ messages: ChatMessage[], session: any } | null> {
    try {
      const response = await api.get(`/sessions/${sessionId}/messages`);
      if (response.success) {
        return {
          messages: response.messages,
          session: response.session
        };
      }
      return null;
    } catch (error) {
      console.error('Get messages error:', error);
      return null;
    }
  }

  async deleteChatSession(sessionId: number): Promise<boolean> {
    try {
      const response = await api.delete(`/sessions/${sessionId}`);
      return response.success;
    } catch (error) {
      console.error('Delete session error:', error);
      return false;
    }
  }

  // Password management functions
  async forgotPassword(email: string): Promise<{ success: boolean; message: string; reset_token?: string }> {
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return {
        success: response.success,
        message: response.message,
        reset_token: response.reset_token // Only in development
      };
    } catch (error: any) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        message: error.message || 'Failed to send reset email'
      };
    }
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/auth/reset-password', {
        reset_token: resetToken,
        new_password: newPassword
      });
      return {
        success: response.success,
        message: response.message
      };
    } catch (error: any) {
      console.error('Reset password error:', error);
      return {
        success: false,
        message: error.message || 'Failed to reset password'
      };
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      return {
        success: response.success,
        message: response.message
      };
    } catch (error: any) {
      console.error('Change password error:', error);
      return {
        success: false,
        message: error.message || 'Failed to change password'
      };
    }
  }

  isAuthenticated(): boolean {
    // Check if we have either user data OR valid tokens
    const hasUser = this.user !== null;
    const hasTokens = this.accessToken !== null && this.refreshToken !== null;
    const isAuth = hasUser || hasTokens;
    console.log('🔍 isAuthenticated() called - user:', this.user, 'hasTokens:', hasTokens, 'result:', isAuth);
    return isAuth;
  }

  getCurrentUser(): User | null {
    return this.user;
  }

  getToken(): string | null {
    return this.accessToken;
  }
}

export const authService = new AuthService();
export default authService; 