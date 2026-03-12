import { ChatResponse, HealthCheck, Message, Model } from "../types";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Helper function to get auth token from localStorage
function getAuthToken(): string | null {
  try {
    return localStorage.getItem("access_token");
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
}

// Helper function to refresh token
async function refreshAuthToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      console.warn("No refresh token available");
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.tokens && data.tokens.access_token) {
        localStorage.setItem("access_token", data.tokens.access_token);
        console.log("Token refreshed successfully");
        return data.tokens.access_token;
      }
    }

    console.warn("Token refresh failed");
    return null;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

// Helper function to make HTTP requests
async function makeRequest(
  endpoint: string,
  options: RequestInit = {},
  retryWithRefresh: boolean = true
): Promise<any> {
  const url = `${API_BASE_URL}/api${endpoint}`;

  // Get auth token and include in headers
  let token = getAuthToken();
  const authHeaders: Record<string, string> = {};

  if (token) {
    authHeaders["Authorization"] = `Bearer ${token}`;
  }

  const defaultOptions: RequestInit = {
    credentials: "include", // Include cookies for session management (fallback)
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  };

  let response = await fetch(url, defaultOptions);

  // If unauthorized and we have a token, try to refresh it
  if (response.status === 401 && token && retryWithRefresh) {
    console.warn("Authentication failed - attempting token refresh");

    const newToken = await refreshAuthToken();
    if (newToken) {
      // Retry the request with the new token
      const newAuthHeaders = {
        ...authHeaders,
        Authorization: `Bearer ${newToken}`,
      };

      const retryOptions: RequestInit = {
        ...defaultOptions,
        headers: {
          ...defaultOptions.headers,
          ...newAuthHeaders,
        },
      };

      response = await fetch(url, retryOptions);
    } else {
      console.warn("Token refresh failed - no new token received");
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    // If still unauthorized after refresh attempt, clear auth data
    if (response.status === 401) {
      console.warn(
        "Authentication failed even after token refresh - clearing auth data"
      );
      localStorage.removeItem("user");
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");

      // Provide a more user-friendly error message for auth failures
      throw new Error("Authentication failed. Please log in again.");
    }

    // For other errors, provide the original error message
    throw new Error(
      errorData.error || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

export const api = {
  // Health check
  async healthCheck(): Promise<HealthCheck> {
    return makeRequest("/health");
  },

  // Get available models
  async getModels(): Promise<Model[]> {
    const data = await makeRequest("/models");
    return data.models;
  },

  // Send chat message via HTTP
  async sendMessage(
    message: string,
    model: string,
    history: Message[]
  ): Promise<ChatResponse> {
    return makeRequest("/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        model,
        history: history.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      }),
    });
  },

  // Chat session management
  async getSessions(): Promise<{ sessions: any[]; success: boolean }> {
    console.log("API: Getting sessions");
    const response = await makeRequest("/sessions");
    console.log("API: Sessions response:", response);
    return response;
  },

  async createSession(
    model: string = "qwen2.5:8b"
  ): Promise<{ session_id: number; success: boolean }> {
    return makeRequest("/sessions", {
      method: "POST",
      body: JSON.stringify({ model }),
    });
  },

  async getSessionMessages(
    sessionId: number
  ): Promise<{ messages: any[]; session: any; success: boolean }> {
    console.log(`API: Getting messages for session ${sessionId}`);
    const response = await makeRequest(`/sessions/${sessionId}/messages`);
    console.log(`API: Session messages response:`, response);
    return response;
  },

  async deleteSession(sessionId: number): Promise<{ success: boolean }> {
    return makeRequest(`/sessions/${sessionId}`, {
      method: "DELETE",
    });
  },

  async newChat(
    model: string = "qwen2.5:8b"
  ): Promise<{ session_id: number; success: boolean }> {
    return makeRequest("/new-chat", {
      method: "POST",
      body: JSON.stringify({ model }),
    });
  },

  // HTTP methods for authentication and sessions
  async get(endpoint: string): Promise<any> {
    return makeRequest(endpoint);
  },

  async post(endpoint: string, data?: any): Promise<any> {
    return makeRequest(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async put(endpoint: string, data?: any): Promise<any> {
    return makeRequest(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async delete(endpoint: string): Promise<any> {
    return makeRequest(endpoint, {
      method: "DELETE",
    });
  },
  async stopGeneration(
    sessionId: number | null
  ): Promise<{ success: boolean }> {
    return makeRequest(`/stop-generation`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  },
};

export default api;
