import { useCallback, useEffect, useState } from "react";
import ChatArea from "./components/ChatArea";
import ChatInput from "./components/ChatInput";
import LoginForm from "./components/LoginForm";
import RegisterForm from "./components/RegisterForm";
import Sidebar from "./components/Sidebar";
import WelcomeScreen from "./components/WelcomeScreen";
import { AlertCircle, X } from "lucide-react";
import ArtifactList from "./components/ArtifactList";
import CodeGenerationPanel from "./components/CodeGenerationPanel";
import ForgotPasswordForm from "./components/ForgotPasswordForm";
import SystemPromptConfig from "./components/SystemPromptConfig";
import { useChat } from "./hooks/useChat";
import authService, { User } from "./services/authService";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isInitialAuthCheck, setIsInitialAuthCheck] = useState(true);

  const [refreshSessionsTrigger, setRefreshSessionsTrigger] = useState(0);

  // Function to trigger session refresh
  const refreshSessions = useCallback(() => {
    setRefreshSessionsTrigger((prev) => prev + 1);
  }, []);

  // Only initialize chat when authenticated
  const {
    messages,
    isLoading,
    models,
    selectedModel,
    isConnected,
    error,
    currentSessionId,
    modelsLoaded,
    sendMessage,
    changeModel,
    loadSession,
    createNewSession,
    stopGeneration,
  } = useChat(isAuthenticated ? refreshSessions : undefined);
  // ----------------------------------
  // Add state for selected message (add this near your other useState declarations)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );

  // Modify the currentStreamingMessage logic
  const getCurrentMessageContent = () => {
    if (selectedMessageId) {
      // Show selected message content
      const selectedMessage = messages.find(
        (msg) => msg.id === selectedMessageId
      );
      return selectedMessage?.content || "";
    }
    // Fallback to current streaming message (last message)
    return messages.length > 0 ? messages[messages.length - 1].content : "";
  };

  let currentDisplayMessage = getCurrentMessageContent();
  useEffect(() => {
    currentDisplayMessage = getCurrentMessageContent();
  }, [messages]);
  // Update the handleToggleCodePanel function (replace existing one)
  const handleToggleCodePanel = (messageId?: string) => {
    if (messageId) {
      // Message-specific toggle
      if (selectedMessageId === messageId && showCodeGenerationPanel) {
        // Same message clicked - close panel
        setShowCodeGenerationPanel(false);
        setSelectedMessageId(null);
      } else {
        // Different message or panel closed - open with this message
        setSelectedMessageId(messageId);
        setShowCodeGenerationPanel(true);
      }
    } else {
      // General toggle (from floating button)
      setShowCodeGenerationPanel(!showCodeGenerationPanel);
      if (!showCodeGenerationPanel) {
        // When opening without specific message, use latest
        setSelectedMessageId(null);
      }
    }
  };

  // ---------------------------------------

  // State for sidebar navigation
  const [activeSection, setActiveSection] = useState<
    "chats" | "projects" | "documents" | "artifacts"
  >("chats");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showCodeGenerationPanel, setShowCodeGenerationPanel] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null
  );
  const [savedArtifacts, setSavedArtifacts] = useState<{ [key: string]: any }>(
    {}
  );

  // Get the current streaming message for the code generation panel
  let currentStreamingMessage =
    messages.length > 0 ? messages[messages.length - 1].content : "";

  // Function to detect if content contains code blocks
  const detectCodeGeneration = (text: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push({
        language: match[1] || "text",
        code: match[2],
        fullMatch: match[0],
      });
    }

    // Also detect incomplete code blocks for streaming
    const incompleteCodeBlockRegex = /```(\w+)?\n([\s\S]*?)(?=\n```|$)/g;
    let incompleteMatch: RegExpExecArray | null;

    while ((incompleteMatch = incompleteCodeBlockRegex.exec(text)) !== null) {
      // Check if this is not already captured
      const isAlreadyCaptured = matches.some(
        (m) =>
          m.fullMatch.includes(incompleteMatch![0]) ||
          incompleteMatch![0].includes(m.fullMatch)
      );

      if (!isAlreadyCaptured && incompleteMatch[2].trim().length > 0) {
        matches.push({
          language: incompleteMatch[1] || "text",
          code: incompleteMatch[2],
          fullMatch: incompleteMatch[0],
        });
      }
    }

    return matches;
  };

  // Auto-open code generation panel when code is detected
  useEffect(() => {
    if (isLoading && currentStreamingMessage) {
      const codeBlocks = detectCodeGeneration(currentStreamingMessage);
      if (codeBlocks.length > 0 && !showCodeGenerationPanel) {
        console.log("🚀 Code detected, opening slide window...");
        setShowCodeGenerationPanel(true);
        setSelectedArtifactId(null); // Clear any selected artifact

        // Show a subtle notification
        const notification = document.createElement("div");
        notification.className =
          "fixed top-4 right-4 bg-blue-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2 transition-all duration-300 transform translate-x-full";
        notification.innerHTML = `
          <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span class="text-sm font-medium">Code generation detected! Slide window opened.</span>
        `;
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
          notification.classList.remove("translate-x-full");
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
          notification.classList.add("translate-x-full");
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 300);
        }, 3000);
      }
    }
  }, [currentStreamingMessage, isLoading, showCodeGenerationPanel]);

  // Keep panel open while code is being generated
  useEffect(() => {
    if (isLoading && currentStreamingMessage) {
      const codeBlocks = detectCodeGeneration(currentStreamingMessage);
      if (codeBlocks.length > 0 && !showCodeGenerationPanel) {
        setShowCodeGenerationPanel(true);
      }
    }
  }, [currentStreamingMessage, isLoading, showCodeGenerationPanel]);

  // Function to toggle code generation panel
  const toggleCodeGenerationPanel = (msgID?: any) => {
    setShowCodeGenerationPanel(!showCodeGenerationPanel);
    if (showCodeGenerationPanel) {
      setSelectedArtifactId(msgID); // Clear selection when closing
      currentStreamingMessage = messages[messages.length - 1].content;
    }
    console.log("🔄 Toggling code panel:", msgID);
  };

  // Handle artifact click from artifact list
  const handleArtifactClick = (artifactId: string) => {
    if (selectedArtifactId === artifactId && showCodeGenerationPanel) {
      // If clicking the same artifact and panel is open, close it
      setShowCodeGenerationPanel(false);
      setSelectedArtifactId(null);
    } else {
      // Open panel with the selected artifact
      setSelectedArtifactId(artifactId);
      setShowCodeGenerationPanel(true);
    }
    console.log("🎯 Artifact clicked:", artifactId);
  };

  // Handle artifact saved
  const handleArtifactSaved = (artifactId: string) => {
    setSavedArtifacts((prev) => ({
      ...prev,
      [artifactId]: { saved: true, timestamp: new Date().toISOString() },
    }));
    console.log("💾 Artifact saved:", artifactId);
  };

  // Keyboard shortcut to toggle code generation panel (Ctrl/Cmd + K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        toggleCodeGenerationPanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showCodeGenerationPanel]);

  const [showWelcome, setShowWelcome] = useState(true);

  // Check authentication on mount and handle OAuth callbacks
  useEffect(() => {
    const checkAuth = async () => {
      console.log("🔍 Checking authentication...");
      setIsInitialAuthCheck(true);

      // Reload tokens from storage first (important after profile switch)
      authService.reloadTokensFromStorage();

      // Check for OAuth callback parameters
      const urlParams = new URLSearchParams(window.location.search);
      const oauthSuccess = urlParams.get("oauth_success");
      const oauthError = urlParams.get("oauth_error");
      const oauthProvider = urlParams.get("provider");

      // Add GitHub integration callback handling
      const githubConnected = urlParams.get("github_connected");
      const githubError = urlParams.get("github_error");

      if (githubConnected === "true") {
        console.log("🔍 GitHub integration success detected");
        // Clean up URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        // The GitHubBrowser component will handle checking the connection status
      } else if (githubError === "true") {
        console.log("🔍 GitHub integration error detected");
        // Clean up URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        // Show error message if needed
      }

      if (oauthSuccess === "true") {
        console.log("🔍 OAuth success detected");

        // Extract JWT tokens from URL parameters
        const accessToken = urlParams.get("access_token");
        const refreshToken = urlParams.get("refresh_token");

        console.log(
          "🔍 Access token from URL:",
          accessToken ? "present" : "missing"
        );
        console.log(
          "🔍 Refresh token from URL:",
          refreshToken ? "present" : "missing"
        );

        if (accessToken && refreshToken) {
          // Save tokens to localStorage
          localStorage.setItem("access_token", accessToken);
          localStorage.setItem("refresh_token", refreshToken);

          // Reload tokens in authService
          authService.reloadTokensFromStorage();

          // Get user profile with the new tokens
          const user = await authService.getProfile();
          if (user) {
            console.log("🔍 OAuth user verified:", user.username);
            setCurrentUser(user);
            setIsAuthenticated(true);
            setShowLogin(false); // Hide login form
            setAuthError("");
            setIsInitialAuthCheck(false); // Mark auth check as complete
          } else {
            console.log("🔍 OAuth verification failed");
            setAuthError("OAuth verification failed. Please try again.");
            setShowLogin(true);
            setIsInitialAuthCheck(false); // Mark auth check as complete
          }
        } else {
          console.log("🔍 No tokens in URL, falling back to verifyOAuthUser");
          // Fallback to old method if no tokens
          const user = await authService.verifyOAuthUser();
          if (user) {
            console.log("🔍 OAuth user verified:", user.username);
            setCurrentUser(user);
            setIsAuthenticated(true);
            setShowLogin(false); // Hide login form
            setAuthError("");
            setIsInitialAuthCheck(false); // Mark auth check as complete
          } else {
            console.log("🔍 OAuth verification failed");
            setAuthError("OAuth verification failed. Please try again.");
            setShowLogin(true);
            setIsInitialAuthCheck(false); // Mark auth check as complete
          }
        }

        // Clean up URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        return; // Exit early to prevent falling through to the else block
      } else if (oauthError === "true") {
        console.log("🔍 OAuth error detected");
        console.log("🔍 OAuth provider:", oauthProvider);
        console.log("🔍 URL params:", window.location.search);

        // Check for specific error details
        const errorParam = urlParams.get("error");
        console.log("🔍 OAuth error details:", errorParam);

        // OAuth login failed
        let errorMessage = `Login with ${oauthProvider} failed. Please try again.`;
        if (errorParam) {
          errorMessage = `Login with ${oauthProvider} failed: ${errorParam}. Please try again.`;
        }

        setAuthError(errorMessage);
        setShowLogin(true); // Show login form
        setIsInitialAuthCheck(false); // Mark auth check as complete
        // Clean up URL parameters
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        return; // Exit early to prevent falling through to the else block
      } else {
        // Check if user is already authenticated from localStorage
        const isAuth = authService.isAuthenticated();
        console.log("🔍 Is authenticated from localStorage:", isAuth);

        if (isAuth) {
          const user = await authService.getProfile();
          console.log("🔍 User from getProfile:", user);
          if (user) {
            console.log("🔍 Setting authenticated user:", user.username);
            setCurrentUser(user);
            setIsAuthenticated(true);
            setShowLogin(false); // Hide login form
            setIsInitialAuthCheck(false); // Mark auth check as complete
          } else {
            console.log("🔍 No user returned, clearing storage");
            // Invalid session, clear storage and show login
            authService.logout();
            setShowLogin(true);
            setIsInitialAuthCheck(false); // Mark auth check as complete
          }
        } else {
          console.log("🔍 Not authenticated, showing login form");
          // Not authenticated, show login form
          setShowLogin(true);
          setIsInitialAuthCheck(false); // Mark auth check as complete
        }
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    setIsAuthLoading(true);
    setAuthError("");

    const response = await authService.login(email, password);

    if (response.success) {
      setCurrentUser(response.user!);
      setIsAuthenticated(true);
      setShowLogin(false); // Hide login form
      setAuthError("");
      setIsInitialAuthCheck(false); // Ensure auth check is marked as complete
    } else {
      setAuthError(response.error || "Login failed");
    }

    setIsAuthLoading(false);
  };

  const handleRegister = async (
    email: string,
    username: string,
    password: string
  ) => {
    setIsAuthLoading(true);
    setAuthError("");

    const response = await authService.register(email, username, password);

    if (response.success) {
      // Auto-login after successful registration
      const loginResponse = await authService.login(email, password);
      if (loginResponse.success) {
        setCurrentUser(loginResponse.user!);
        setIsAuthenticated(true);
        setShowLogin(false); // Hide login form
        setAuthError("");
        setIsInitialAuthCheck(false); // Ensure auth check is marked as complete
      } else {
        setAuthError(
          "Registration successful but login failed. Please try logging in."
        );
      }
    } else {
      setAuthError(response.error || "Registration failed");
    }

    setIsAuthLoading(false);
  };

  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:5000/api/auth/google/login";
  };

  const handleGithubLogin = () => {
    window.location.href = "http://localhost:5000/api/auth/github/login";
  };

  const handleLogout = async () => {
    // Stop generation before logging out to avoid authentication issues
    try {
      await stopGeneration();
    } catch (error) {
      // Ignore errors when stopping generation during logout
      console.log("Stop generation during logout:", error);
    }

    await authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowLogin(true); // Show login form after logout
    setShowForgotPassword(false);
    setAuthError("");
  };

  const handleStartChat = () => {
    setShowWelcome(false);
  };

  const handleNewChat = async () => {
    await createNewSession();
    // Don't call newChat() here as createNewSession already handles clearing messages
    setShowWelcome(true);
    setShowCodeGenerationPanel(false); // Hide code panel when starting new chat
    setSelectedArtifactId(null); // Clear any selected artifact
  };

  // Sidebar navigation handlers
  const handleChatsClick = () => {
    setActiveSection("chats");
    setShowArtifacts(false);
  };

  const handleProjectsClick = () => {
    setActiveSection("projects");
    setShowArtifacts(false);
  };

  const handleDocumentsClick = () => {
    setActiveSection("documents");
    setShowArtifacts(false);
  };

  const handleSettingsClick = () => {};

  const handleArtifactsClick = () => {
    setShowArtifacts(true);
    setActiveSection("artifacts");
  };

  const handleAttachmentData = (payload: string) => {
    console.log("Payload from ChatInput:", JSON.parse(payload));
    // { text: "...", attachments: [{ type, url }, ...] }
  };

  const handleSessionSelect = async (sessionId: number) => {
    await loadSession(sessionId);
    setShowWelcome(false);
    setShowCodeGenerationPanel(false); // Hide code panel when loading a session
    setSelectedArtifactId(null); // Clear any selected artifact
  };
  // Show welcome screen when there are no messages
  const shouldShowWelcome = showWelcome && messages.length === 0;

  // Show loading screen during initial authentication check
  if (isInitialAuthCheck) {
    return (
      <div className="min-h-screen bg-chat-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Show authentication forms if not authenticated
  if (!isAuthenticated) {
    if (showForgotPassword) {
      return (
        <ForgotPasswordForm
          onBackToLogin={() => {
            setShowForgotPassword(false);
            setShowLogin(true);
          }}
          onSwitchToRegister={() => {
            setShowForgotPassword(false);
            setShowLogin(false);
          }}
        />
      );
    }

    return showLogin ? (
      <LoginForm
        onLogin={handleLogin}
        onSwitchToRegister={() => setShowLogin(false)}
        onForgotPassword={() => setShowForgotPassword(true)}
        onGoogleLogin={handleGoogleLogin}
        onGithubLogin={handleGithubLogin}
        isLoading={isAuthLoading}
        error={authError}
      />
    ) : (
      <RegisterForm
        onRegister={handleRegister}
        onSwitchToLogin={() => setShowLogin(true)}
        onGoogleLogin={handleGoogleLogin}
        onGithubLogin={handleGithubLogin}
        isLoading={isAuthLoading}
        error={authError}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-chat-bg overflow-hidden app-container">
      {/* Sidebar */}

      <Sidebar
        models={models}
        selectedModel={selectedModel}
        onModelChange={changeModel}
        onNewChat={handleNewChat}
        currentUser={currentUser}
        onLogout={handleLogout}
        messageCount={messages.length}
        onChatsClick={handleChatsClick}
        onProjectsClick={handleProjectsClick}
        onDocumentsClick={handleDocumentsClick}
        onSettingsClick={handleSettingsClick}
        onSystemPromptClick={() => setShowSystemPrompt(true)}
        onArtifactsClick={handleArtifactsClick}
        activeSection={activeSection}
        onSessionSelect={handleSessionSelect}
        currentSessionId={currentSessionId || undefined}
        refreshSessions={refreshSessions}
        refreshSessionsTrigger={refreshSessionsTrigger}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 chat-container ">
        {/* Error Banner */}
        {error && (
          <div className="flex-shrink-0 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-red-400 hover:text-red-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Connection Status */}
        {!isConnected && !error && (
          <div className="flex-shrink-0 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-3 flex items-center space-x-2">
            <AlertCircle className="w-5 h-5" />
            <span>Connecting to server...</span>
          </div>
        )}

        {/* V2 Handler Toggle */}
        {/* <div className=" flex-shrink-0 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 flex flex-wrap space-y-2 items-center justify-center md:justify-between">
          <div className="flex flex-wrap items-center space-x-2">
            <span className="text-sm">Handler Version:</span>
            <span className="text-sm font-medium">{useV2Handler ? 'V2 (with metadata)' : 'V1 (standard)'}</span>
          </div>
          <div className="flex flex-wrap items-center space-x-2">
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              {showDebugPanel ? 'Hide' : 'Show'} Debug
            </button>
            <button
              onClick={toggleV2Handler}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              Switch to {useV2Handler ? 'V1' : 'V2'}
            </button>
          </div>
        </div> */}

        {/* Main Content Area - Takes remaining space */}
        <div className="flex-1 flex min-h-0 ">
          <div
            className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ${
              showCodeGenerationPanel ? "mr-0" : ""
            }`}
          >
            {/* Scrollable Chat Area */}
            <div className="flex-1 overflow-y-auto min-h-0 chat-scrollbar">
              {showArtifacts ? (
                <div className="p-6">
                  <ArtifactList
                    onArtifactClick={handleArtifactClick}
                    selectedArtifactId={selectedArtifactId}
                    savedArtifacts={savedArtifacts}
                    onArtifactSaved={handleArtifactSaved}
                  />
                </div>
              ) : shouldShowWelcome ? (
                <WelcomeScreen
                  onStartChat={handleStartChat}
                  currentUser={currentUser}
                />
              ) : (
                <ChatArea
                  messages={messages}
                  isLoading={isLoading}
                  onStartChat={handleStartChat}
                  hideCodeBlocks={showCodeGenerationPanel}
                  //  onToggleCodePanel={toggleCodeGenerationPanel}
                  onToggleCodePanel={handleToggleCodePanel} // This is already correct
                  selectedMessageId={selectedMessageId} // Add this new prop
                  models={models}
                  modelsLoaded={modelsLoaded}
                />
              )}
            </div>

            {/* Fixed Chat Input at Bottom */}
            <div className="flex-shrink-0">
              <ChatInput
                onSendMessage={sendMessage}
                models={models}
                selectedModel={selectedModel}
                onModelChange={changeModel}
                isLoading={isLoading}
                onAttachment={handleAttachmentData}
                codeGenerationPanel={setShowCodeGenerationPanel}
                setMessageId={setSelectedMessageId}
                stopGeneration={stopGeneration}
                disabled={modelsLoaded && models.length === 0}
              />
            </div>
          </div>

          {/* Code Generation Panel */}
          {showCodeGenerationPanel && (
            <div className=" flex-1 flex-shrink-0">
              <CodeGenerationPanel
                currentMessage={currentDisplayMessage} // Change from currentStreamingMessage
                // selectedMessageId={selectedMessageId} // Add this
                isVisible={showCodeGenerationPanel}
                // currentMessage={currentStreamingMessage}
                isLoading={isLoading}
                onClose={toggleCodeGenerationPanel}
                selectedArtifactId={selectedArtifactId}
                onArtifactSaved={handleArtifactSaved}
                onArtifactClick={(artifactId) => {
                  console.log("Code generation artifact clicked:", artifactId);
                  // You can add additional logic here for artifact handling
                }}
              />
            </div>
          )}
        </div>
      </div>
      {/* //4 */}

      {/* System Prompt Configuration Modal */}
      {showSystemPrompt && (
        <SystemPromptConfig onClose={() => setShowSystemPrompt(false)} />
      )}
    </div>
  );
}

export default App;
