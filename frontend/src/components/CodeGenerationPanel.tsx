import Editor from "@monaco-editor/react";
import {
  Atom,
  CheckCircle,
  ChevronDown,
  Code,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Globe,
  Maximize2,
  Minimize2,
  Palette,
  Play,
  Save,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import SandpackPreview from "./SandpackPreview";

interface CodeGenerationPanelProps {
  isVisible: boolean;
  currentMessage: string;
  isLoading: boolean;
  onArtifactClick?: (artifactId: string) => void;
  onClose?: () => void;
  selectedArtifactId?: string | null;
  onArtifactSaved?: (artifactId: string) => void;
}

interface GeneratedArtifact {
  id: string;
  type: "html" | "css" | "javascript" | "code" | "text" | "react";
  language?: string;
  content: string;
  title: string;
  timestamp: string;
  isExecutable: boolean;
  previewUrl?: string;
  isSaved?: boolean;
  savedArtifactId?: string;
  // selectedMessageId?: string | null;
  onMessageSelect?: (messageId: string | null) => void;
  selectedMessageId?: string | null; // Add this new prop
}

const CodeGenerationPanel: React.FC<CodeGenerationPanelProps> = ({
  isVisible,
  currentMessage,
  isLoading,
  onArtifactClick,
  onClose,
  selectedArtifactId,
  onArtifactSaved,
}) => {
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [activeView, setActiveView] = useState<"code" | "preview">("code");
  const [isAnimating, setIsAnimating] = useState(false);
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null);
  const [savedArtifactId, setSavedArtifactId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const editorRef = useRef<any>(null);
  const editingEditorRef = useRef<any>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [shouldRenderEditor, setShouldRenderEditor] = useState(true);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (_event: MouseEvent) => {
      if (isDownloadDropdownOpen) {
        setIsDownloadDropdownOpen(false);
      }
    };

    if (isDownloadDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDownloadDropdownOpen]);

  // Listen for chunk updates to detect code generation
  useEffect(() => {
    if (!isVisible || !currentMessage) return;

    // Parse the current message to detect code blocks
    const codeBlocks = detectCodeBlocks(currentMessage);

    // Only update if we have new code blocks
    if (codeBlocks.length > 0) {
      // Create new artifacts or update existing ones
      const newArtifacts: GeneratedArtifact[] = codeBlocks.map(
        (block, index) => {
          const existingArtifact = artifacts.find(
            (a) =>
              a.language === block.language &&
              a.content.length <= block.code.length &&
              block.code.startsWith(a.content)
          );

          if (existingArtifact) {
            // Update existing artifact with new content
            return {
              ...existingArtifact,
              content: block.code,
              previewUrl: isExecutable(block.language, block.code)
                ? createPreviewUrl(
                    block.code,
                    getContentType(block.language, block.code)
                  )
                : undefined,
            };
          } else {
            // Create new artifact
            return {
              id: `generated-${Date.now()}-${index}`,
              type: getContentType(block.language, block.code),
              language: block.language,
              content: block.code,
              title: generateDynamicArtifactName(block.language, block.code),
              timestamp: new Date().toISOString(),
              isExecutable: isExecutable(block.language, block.code),
              previewUrl: isExecutable(block.language, block.code)
                ? createPreviewUrl(
                    block.code,
                    getContentType(block.language, block.code)
                  )
                : undefined,
              isSaved: false,
            };
          }
        }
      );

      setArtifacts(newArtifacts);
    }
  }, [currentMessage, isVisible]);

  // Animation effect when panel opens
  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Layout refresh when maximize state changes
  useEffect(() => {
    if (isMaximized) {
      // When going to full screen, just refresh layout
      const refreshLayout = () => {
        if (editorRef.current) {
          editorRef.current.layout();
        }
        if (editingEditorRef.current) {
          editingEditorRef.current.layout();
        }
      };
      setTimeout(refreshLayout, 100);
    } else {
      // When minimizing from full screen, force complete re-mount
      setIsTransitioning(true);
      setShouldRenderEditor(false);

      // Clear editor references
      editorRef.current = null;
      editingEditorRef.current = null;

      // Force editor re-mount after a delay
      setTimeout(() => {
        setShouldRenderEditor(true);
        setEditorKey((prev) => prev + 1);
        setIsTransitioning(false);
      }, 200);
    }
  }, [isMaximized]);

  // Window resize fallback
  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
      if (editingEditorRef.current) {
        editingEditorRef.current.layout();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const detectCodeBlocks = (text: string) => {
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

    // Also detect incomplete code blocks (for streaming)
    const incompleteCodeBlockRegex = /```(\w+)?\n([\s\S]*?)(?=\n```|$)/g;
    let incompleteMatch: RegExpExecArray | null;

    while ((incompleteMatch = incompleteCodeBlockRegex.exec(text)) !== null) {
      // Check if this is not already captured by the complete regex
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

  const getContentType = (
    language?: string,
    code?: string
  ): "html" | "css" | "javascript" | "code" | "text" | "react" => {
    if (!language && !code) return "text";

    const lang = language?.toLowerCase() || "";
    const content = code?.toLowerCase() || "";

    if (
      lang === "html" ||
      content.includes("<!doctype html>") ||
      content.includes("<html")
    )
      return "html";

    // Check for React/JSX content FIRST (before CSS check)
    if (
      lang === "jsx" ||
      lang === "tsx" ||
      lang === "react" ||
      content.includes("react") ||
      content.includes("usestate") ||
      content.includes("useeffect") ||
      content.includes("function app") ||
      content.includes("export default") ||
      content.includes("import react") ||
      content.includes("from 'react'") ||
      content.includes('from "react"') ||
      (content.includes("import {") && content.includes("} from")) ||
      (content.includes("<") && content.includes("/>")) ||
      (content.includes("return (") && content.includes("<"))
    ) {
      return "react";
    }

    // More specific CSS detection to avoid false positives
    if (
      lang === "css" ||
      (content.includes("{") &&
        content.includes(":") &&
        !content.includes("import") &&
        !content.includes("function") &&
        !content.includes("const ") &&
        !content.includes("let ") &&
        !content.includes("var "))
    )
      return "css";

    if (
      lang === "javascript" ||
      lang === "js" ||
      content.includes("function") ||
      content.includes("const ")
    )
      return "javascript";
    if (lang === "python" || lang === "java" || lang === "cpp" || lang === "c")
      return "code";

    return "text";
  };

  const isExecutable = (language?: string, code?: string): boolean => {
    const contentType = getContentType(language, code);
    return (
      contentType === "html" ||
      contentType === "javascript" ||
      contentType === "react"
    );
  };

  const createPreviewUrl = (content: string, contentType?: string): string => {
    let fullHTML = "";

    if (contentType === "react") {
      // Create React preview HTML using the backend function pattern
      fullHTML = createReactPreviewHTML(content);
    } else {
      // Regular HTML content
      fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Live Preview</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          </style>
        </head>
        <body>
          ${content}
        </body>
        </html>
      `;
    }

    const blob = new Blob([fullHTML], { type: "text/html" });
    return URL.createObjectURL(blob);
  };

  const createReactPreviewHTML = (reactCode: string): string => {
    // Clean and prepare the React code
    const lines = reactCode.trim().split("\n");
    const cleanedLines = [];
    let componentName = "App";

    for (const line of lines) {
      // Skip import statements
      if (
        line.trim().startsWith("import ") ||
        line.trim().startsWith("export default")
      ) {
        if (line.includes("export default")) {
          // Extract component name from export default
          const match = line.match(/export\s+default\s+(?:function\s+)?(\w+)/);
          if (match) {
            componentName = match[1];
          }
        }
        continue;
      }
      cleanedLines.push(line);
    }

    const componentCode = cleanedLines.join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    
    <!-- React and ReactDOM from CDN -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    
    <!-- Babel for JSX transformation -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- Tailwind CSS for styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        #root {
            width: 100%;
            height: 100vh;
        }
        
        .error-boundary {
            padding: 20px;
            background-color: #fee2e2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            margin: 20px;
        }
        
        .error-title {
            color: #dc2626;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .error-message {
            color: #7f1d1d;
            font-family: monospace;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext } = React;
        
        // Error Boundary Component
        class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { hasError: false, error: null, errorInfo: null };
            }
            
            static getDerivedStateFromError(error) {
                return { hasError: true };
            }
            
            componentDidCatch(error, errorInfo) {
                this.setState({
                    error: error,
                    errorInfo: errorInfo
                });
            }
            
            render() {
                if (this.state.hasError) {
                    return (
                        <div className="error-boundary">
                            <div className="error-title">⚠️ Component Error</div>
                            <div className="error-message">
                                {this.state.error && this.state.error.toString()}
                                <br />
                                {this.state.errorInfo.componentStack}
                            </div>
                        </div>
                    );
                }
                
                return this.props.children;
            }
        }
        
        // Your React Component
        ${componentCode}
        
        // Render the component
        const root = ReactDOM.createRoot(document.getElementById('root'));
        
        try {
            root.render(
                <ErrorBoundary>
                    <${componentName} />
                </ErrorBoundary>
            );
        } catch (error) {
            root.render(
                <div className="error-boundary">
                    <div className="error-title">⚠️ Render Error</div>
                    <div className="error-message">{error.toString()}</div>
                </div>
            );
        }
    </script>
</body>
</html>`;
  };

  const getLanguageDisplayName = (lang?: string) => {
    const languages: { [key: string]: string } = {
      javascript: "JavaScript",
      js: "JavaScript",
      jsx: "React JSX",
      tsx: "TypeScript JSX",
      typescript: "TypeScript",
      ts: "TypeScript",
      python: "Python",
      html: "HTML",
      css: "CSS",
      java: "Java",
      cpp: "C++",
      c: "C",
    };
    return (
      languages[lang?.toLowerCase() || ""] || lang?.toUpperCase() || "CODE"
    );
  };

  const isReactProject = (content: string): boolean => {
    const contentLower = content.toLowerCase();
    const reactIndicators = [
      'package.json',
      'vite.config.js',
      'src/main.jsx',
      'src/app.jsx',
      'index.html',
      'react-dom',
      'vite'
    ];
    
    return reactIndicators.some(indicator => contentLower.includes(indicator));
  };

  const generateDynamicArtifactName = (
    language?: string,
    code?: string
  ): string => {
    const lang = language?.toLowerCase() || "";
    const content = code?.toLowerCase() || "";

    // Check if this is a React project
    if (isReactProject(content)) {
      if (content.includes("todo") || content.includes("task")) {
        return "React Todo App";
      }
      if (content.includes("dashboard")) {
        return "React Dashboard App";
      }
      if (content.includes("calculator")) {
        return "React Calculator App";
      }
      if (content.includes("weather")) {
        return "React Weather App";
      }
      if (content.includes("chat") || content.includes("messaging")) {
        return "React Chat App";
      }
      if (content.includes("portfolio")) {
        return "React Portfolio App";
      }
      if (content.includes("ecommerce") || content.includes("shop")) {
        return "React E-commerce App";
      }
      if (content.includes("blog")) {
        return "React Blog App";
      }
      if (content.includes("game")) {
        return "React Game App";
      }
      return "React Application";
    }

    // HTML-specific patterns
    if (
      lang === "html" ||
      content.includes("<!doctype html>") ||
      content.includes("<html")
    ) {
      if (content.includes("tic tac toe") || content.includes("tictactoe")) {
        return "Tic Tac Toe Game";
      }
      if (content.includes("login") && content.includes("form")) {
        return "Login Form";
      }
      if (content.includes("signup") || content.includes("register")) {
        return "Registration Form";
      }
      if (content.includes("dashboard")) {
        return "Dashboard Interface";
      }
      if (content.includes("todo") || content.includes("task")) {
        return "Todo List Application";
      }
      if (content.includes("calculator")) {
        return "Calculator App";
      }
      if (content.includes("weather")) {
        return "Weather App";
      }
      if (content.includes("portfolio")) {
        return "Portfolio Website";
      }
      if (content.includes("landing")) {
        return "Landing Page";
      }
      if (content.includes("navbar") || content.includes("navigation")) {
        return "Navigation Component";
      }
      if (content.includes("card") && content.includes("component")) {
        return "Card Component";
      }
      if (content.includes("modal")) {
        return "Modal Component";
      }
      if (content.includes("button") && content.includes("component")) {
        return "Button Component";
      }
      return "HTML Application";
    }

    // React/JSX specific patterns
    if (
      lang === "jsx" ||
      lang === "tsx" ||
      content.includes("react") ||
      content.includes("usestate")
    ) {
      if (content.includes("login") && content.includes("authentication")) {
        return "React Login Form with Authentication";
      }
      if (content.includes("signup") || content.includes("register")) {
        return "React Registration Component";
      }
      if (content.includes("todo") || content.includes("task")) {
        return "React Todo List";
      }
      if (content.includes("counter")) {
        return "React Counter Component";
      }
      if (content.includes("dashboard")) {
        return "React Dashboard";
      }
      if (content.includes("navbar") || content.includes("navigation")) {
        return "React Navigation Component";
      }
      if (content.includes("modal")) {
        return "React Modal Component";
      }
      if (content.includes("form") && content.includes("validation")) {
        return "React Form with Validation";
      }
      if (content.includes("chat") || content.includes("messaging")) {
        return "React Chat Component";
      }
      if (content.includes("weather")) {
        return "React Weather App";
      }
      if (content.includes("calculator")) {
        return "React Calculator";
      }
      return "React Component";
    }

    // JavaScript specific patterns
    if (lang === "javascript" || lang === "js") {
      if (content.includes("api") && content.includes("fetch")) {
        return "API Integration Script";
      }
      if (content.includes("validation") && content.includes("form")) {
        return "Form Validation Script";
      }
      if (content.includes("animation") || content.includes("animate")) {
        return "Animation Script";
      }
      if (content.includes("chart") || content.includes("graph")) {
        return "Data Visualization Script";
      }
      if (content.includes("game")) {
        return "Game Logic Script";
      }
      if (content.includes("utility") || content.includes("helper")) {
        return "Utility Functions";
      }
      if (content.includes("class") && content.includes("constructor")) {
        return "JavaScript Class";
      }
      return "JavaScript Script";
    }

    // CSS specific patterns
    if (lang === "css") {
      if (content.includes("responsive") || content.includes("media query")) {
        return "Responsive CSS Styles";
      }
      if (content.includes("animation") || content.includes("keyframe")) {
        return "CSS Animations";
      }
      if (content.includes("grid") || content.includes("flexbox")) {
        return "CSS Layout Styles";
      }
      if (content.includes("button") && content.includes("hover")) {
        return "Button Styles";
      }
      if (content.includes("navbar") || content.includes("navigation")) {
        return "Navigation Styles";
      }
      if (content.includes("card")) {
        return "Card Component Styles";
      }
      return "CSS Stylesheet";
    }

    // Python specific patterns
    if (lang === "python" || lang === "py") {
      if (content.includes("flask") || content.includes("django")) {
        return "Python Web Application";
      }
      if (
        content.includes("api") &&
        (content.includes("fastapi") || content.includes("rest"))
      ) {
        return "Python REST API";
      }
      if (content.includes("scraping") || content.includes("beautifulsoup")) {
        return "Web Scraping Script";
      }
      if (
        content.includes("data") &&
        (content.includes("pandas") || content.includes("numpy"))
      ) {
        return "Data Analysis Script";
      }
      if (content.includes("machine learning") || content.includes("sklearn")) {
        return "Machine Learning Model";
      }
      if (content.includes("automation") || content.includes("script")) {
        return "Automation Script";
      }
      if (content.includes("class") && content.includes("def __init__")) {
        return "Python Class";
      }
      return "Python Script";
    }

    // Generic fallback based on language
    const languageNames: { [key: string]: string } = {
      java: "Java Application",
      cpp: "C++ Program",
      c: "C Program",
      typescript: "TypeScript Module",
      ts: "TypeScript Module",
      php: "PHP Script",
      ruby: "Ruby Script",
      go: "Go Program",
      rust: "Rust Program",
      swift: "Swift Program",
      kotlin: "Kotlin Program",
      sql: "SQL Query",
      bash: "Bash Script",
      powershell: "PowerShell Script",
      yaml: "YAML Configuration",
      json: "JSON Data",
      xml: "XML Document",
      markdown: "Markdown Document",
      dockerfile: "Docker Configuration",
    };

    return languageNames[lang] || `${getLanguageDisplayName(language)} Code`;
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case "html":
        return <Globe className="w-5 h-5" />;
      case "css":
        return <Palette className="w-5 h-5" />;
      case "javascript":
        return <Code className="w-5 h-5" />;
      case "react":
        return <Atom className="w-5 h-5" />;
      case "code":
        return <Zap className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const handleCreateArtifact = async (artifact: GeneratedArtifact) => {
    try {
      // Check if this is a React project
      if (isReactProject(artifact.content)) {
        // Save as React project
        const response = await fetch("/api/projects/save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: artifact.content,
          }),
        });

        if (response.ok) {
          const projectData = await response.json();

          // Update local state to mark as saved
          setArtifacts((prev) =>
            prev.map((a) =>
              a.id === artifact.id
                ? { ...a, isSaved: true, savedArtifactId: projectData.project_name }
                : a
            )
          );

          // Show saved feedback
          setSavedArtifactId(artifact.id);
          setTimeout(() => setSavedArtifactId(null), 2000);

          // Notify parent about the saved project
          if (onArtifactSaved) {
            onArtifactSaved(projectData.project_name);
          }

          // Close the panel after successful save
          setTimeout(() => {
            if (onClose) {
              onClose();
            }
          }, 1500);

          if (onArtifactClick) {
            onArtifactClick(projectData.project_name);
          }
        } else {
          const errorData = await response.json();
          console.error("Failed to save React project:", errorData.error);
        }
      } else {
        // Save as regular artifact
        const response = await fetch("/api/artifacts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type:
              artifact.type === "html"
                ? "text/html"
                : artifact.type === "react"
                ? "application/vnd.ant.react"
                : "application/vnd.ant.code",
            content: artifact.content,
            title: artifact.title,
            language: artifact.language,
          }),
        });

        if (response.ok) {
          const createdArtifact = await response.json();

          // Update local state to mark as saved
          setArtifacts((prev) =>
            prev.map((a) =>
              a.id === artifact.id
                ? { ...a, isSaved: true, savedArtifactId: createdArtifact.id }
                : a
            )
          );

          // Show saved feedback
          setSavedArtifactId(artifact.id);
          setTimeout(() => setSavedArtifactId(null), 2000);

          // Notify parent about the saved artifact
          if (onArtifactSaved) {
            onArtifactSaved(createdArtifact.id);
          }

          // Close the panel after successful save
          setTimeout(() => {
            if (onClose) {
              onClose();
            }
          }, 1500);

          if (onArtifactClick) {
            onArtifactClick(createdArtifact.id);
          }
        }
      }
    } catch (error) {
      console.error("Failed to create artifact:", error);
    }
  };

  const handleCopyCode = (content: string, artifactId: string) => {
    navigator.clipboard.writeText(content);

    // Show copy feedback
    setCopiedArtifactId(artifactId);
    setTimeout(() => setCopiedArtifactId(null), 2000);
  };

  const handleDownloadCode = (
    content: string,
    language: string,
    title: string
  ) => {
    const extension = getFileExtension(language);
    const filename = `${title.toLowerCase().replace(/\s+/g, "-")}.${extension}`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadProject = (artifact: GeneratedArtifact) => {
    // Create a zip-like structure for the project
    const projectName = artifact.title.toLowerCase().replace(/\s+/g, "-");

    // For now, we'll create a single file with all the content
    // In a real implementation, you might want to create multiple files
    const projectContent = `# ${artifact.title}

## Project Structure
This is a generated project from the AI Code Generation Chatbot.

## Main File
\`\`\`${artifact.language || "text"}
${artifact.content}
\`\`\`

## Generated on
${new Date().toISOString()}
`;

    const blob = new Blob([projectContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}-project.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const getFileExtension = (language?: string): string => {
    const lang = language?.toLowerCase() || "";
    switch (lang) {
      case "html":
        return "html";
      case "css":
        return "css";
      case "javascript":
      case "js":
        return "js";
      case "python":
        return "py";
      case "java":
        return "java";
      case "cpp":
        return "cpp";
      case "c":
        return "c";
      case "typescript":
      case "ts":
        return "ts";
      case "jsx":
        return "jsx";
      case "tsx":
        return "tsx";
      default:
        return "txt";
    }
  };

  const handleEditToggle = (artifact: GeneratedArtifact) => {
    if (isEditing) {
      // Save the edited content
      setArtifacts((prev) =>
        prev.map((a) =>
          a.id === artifact.id ? { ...a, content: editedContent } : a
        )
      );
      setIsEditing(false);
    } else {
      // Start editing
      setEditedContent(artifact.content);
      setIsEditing(true);
    }
  };

  if (!isVisible) return null;

  const currentArtifact =
    artifacts.find((a) => a.id === selectedArtifactId) || artifacts[0];

  return (
    <div
      className={`bg-gray-900 border-l border-gray-600 transition-all duration-300 flex h-full w-full ${
        isMaximized ? "fixed inset-0 z-50" : ""
      } ${isAnimating ? "animate-slideIn" : ""}`}
    >
      {/* Right Side - Code/Preview Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        {currentArtifact ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-600 bg-gray-800">
              <div className="flex items-center space-x-3">
                <div className="text-gray-300">
                  {getArtifactIcon(currentArtifact.type)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100">
                    {currentArtifact.title}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {getLanguageDisplayName(currentArtifact.language)}
                  </p>
                  {isLoading && (
                    <div className="flex items-center space-x-1 mt-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-blue-500">
                        Live streaming...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* View Toggle */}
                <div className="flex bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setActiveView("code")}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      activeView === "code"
                        ? "bg-gray-600 text-gray-100 shadow-sm"
                        : "text-gray-300 hover:text-gray-100"
                    }`}
                  >
                    <Code className="w-4 h-4 inline mr-1" />
                    Code
                  </button>
                  <button
                    onClick={() => setActiveView("preview")}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      activeView === "preview"
                        ? "bg-gray-600 text-gray-100 shadow-sm"
                        : "text-gray-300 hover:text-gray-100"
                    }`}
                    disabled={
                      !currentArtifact.isExecutable &&
                      currentArtifact.type !== "react"
                    }
                  >
                    <Eye className="w-4 h-4 inline mr-1" />
                    Preview
                  </button>
                </div>

                {/* Action Buttons */}
                <button
                  onClick={() =>
                    handleCopyCode(currentArtifact.content, currentArtifact.id)
                  }
                  className={`p-2 rounded transition-colors ${
                    copiedArtifactId === currentArtifact.id
                      ? "bg-green-600 text-green-100"
                      : "hover:bg-gray-700 text-gray-300"
                  }`}
                  title="Copy code"
                >
                  {copiedArtifactId === currentArtifact.id ? (
                    <CheckCircle size={16} />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>

                <button
                  onClick={() => handleEditToggle(currentArtifact)}
                  className={`p-2 rounded transition-colors ${
                    isEditing
                      ? "bg-blue-600 text-blue-100"
                      : "hover:bg-gray-700 text-gray-300"
                  }`}
                  title={isEditing ? "Save changes" : "Edit code"}
                >
                  <Edit3 size={16} />
                </button>

                {/* Download Dropdown */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setIsDownloadDropdownOpen(!isDownloadDropdownOpen)
                    }
                    className="p-2 hover:bg-gray-700 rounded text-gray-300 flex items-center space-x-1"
                    title="Download options"
                  >
                    <Download size={16} />
                    <ChevronDown size={12} />
                  </button>

                  {isDownloadDropdownOpen && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsDownloadDropdownOpen(false)}
                      />

                      {/* Dropdown Menu */}
                      <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-20">
                        <button
                          onClick={() => {
                            handleDownloadCode(
                              currentArtifact.content,
                              currentArtifact.language || "",
                              currentArtifact.title
                            );
                            setIsDownloadDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <FileText size={16} />
                          <span>Download File</span>
                        </button>

                        <button
                          onClick={() => {
                            handleDownloadProject(currentArtifact);
                            setIsDownloadDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                        >
                          <Globe size={16} />
                          <span>Download Project</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-2 hover:bg-gray-700 rounded text-gray-300"
                  title={isMaximized ? "Minimize" : "Maximize"}
                >
                  {isMaximized ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </button>

                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-700 rounded text-gray-300"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden min-h-0">
              {activeView === "code" ? (
                /* Code View */
                <div className="h-full overflow-hidden relative">
                  {isTransitioning && (
                    <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-10">
                      <div className="text-gray-300 text-sm">
                        Resizing editor...
                      </div>
                    </div>
                  )}
                  {!shouldRenderEditor && (
                    <div className="h-full flex items-center justify-center bg-gray-900">
                      <div className="text-gray-400 text-sm">
                        Preparing editor...
                      </div>
                    </div>
                  )}
                  {isEditing ? (
                    <div
                      className={`h-full ${
                        isTransitioning ? "opacity-0" : "opacity-100"
                      } transition-opacity duration-200`}
                    >
                      {shouldRenderEditor && (
                        <Editor
                          key={`editing-${editorKey}`}
                          height="100%"
                          language={currentArtifact.language}
                          value={editedContent}
                          onChange={(value) => setEditedContent(value || "")}
                          onMount={(editor) => {
                            editingEditorRef.current = editor;
                          }}
                          theme="vs-dark"
                          options={{
                            fontSize: 13,
                            lineHeight: 20,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            lineNumbers: "on",
                            renderLineHighlight: "line",
                            selectOnLineNumbers: true,
                            roundedSelection: false,
                            readOnly: false,
                            cursorStyle: "line",
                            glyphMargin: false,
                            folding: true,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 3,
                            renderWhitespace: "selection",
                            contextmenu: true,
                            mouseWheelZoom: true,
                            smoothScrolling: true,
                            cursorBlinking: "blink",
                            cursorSmoothCaretAnimation: "on",
                            padding: { top: 8, bottom: 8 },
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      className={`h-full ${
                        isTransitioning ? "opacity-0" : "opacity-100"
                      } transition-opacity duration-200`}
                    >
                      {shouldRenderEditor && (
                        <Editor
                          key={`readonly-${editorKey}`}
                          height="100%"
                          language={currentArtifact.language}
                          value={currentArtifact.content}
                          onMount={(editor) => {
                            editorRef.current = editor;
                          }}
                          theme="vs-dark"
                          options={{
                            fontSize: 13,
                            lineHeight: 20,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            lineNumbers: "on",
                            renderLineHighlight: "line",
                            selectOnLineNumbers: true,
                            roundedSelection: false,
                            readOnly: true,
                            cursorStyle: "line",
                            glyphMargin: false,
                            folding: true,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 3,
                            renderWhitespace: "selection",
                            contextmenu: true,
                            mouseWheelZoom: true,
                            smoothScrolling: true,
                            cursorBlinking: "blink",
                            cursorSmoothCaretAnimation: "on",
                            padding: { top: 8, bottom: 8 },
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Preview View */
                <div className="h-full">
                  {currentArtifact.type === "react" ? (
                    /* Sandpack Preview for React Code */
                    <div className="h-full bg-gray-900">
                      <SandpackPreview
                        code={
                          isEditing ? editedContent : currentArtifact.content
                        }
                        type={currentArtifact.type}
                      />
                    </div>
                  ) : currentArtifact.isExecutable &&
                    currentArtifact.previewUrl ? (
                    /* HTML Preview for non-React code */
                    <div className="h-full bg-gray-900">
                      <div className="bg-gray-800 px-4 py-3 border-b border-gray-600 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Eye className="w-4 h-4 text-blue-400" />
                          <span className="text-gray-200 text-sm font-medium">
                            Live Preview
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-xs text-gray-400">Live</span>
                        </div>
                      </div>
                      <div className="h-full">
                        <iframe
                          src={currentArtifact.previewUrl}
                          className="w-full h-full"
                          title="Live Preview"
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 px-4">
                      <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Eye className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-300 text-sm font-medium mb-2">
                        No preview available
                      </p>
                      <p className="text-gray-400 text-xs">
                        This code doesn't have a live preview
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 p-4 border-t border-gray-600 bg-gray-800">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-300">
                    {currentArtifact.content?.split("\n").length || 0} lines
                  </span>
                  {currentArtifact.isExecutable && (
                    <span className="text-xs bg-green-600 text-green-100 px-2 py-1 rounded-full">
                      <Play className="w-3 h-3 inline mr-1" />
                      Executable
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCreateArtifact(currentArtifact)}
                    className={`flex items-center space-x-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
                      savedArtifactId === currentArtifact.id
                        ? "bg-green-500 text-white"
                        : currentArtifact.isSaved
                        ? "bg-blue-500 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                  >
                    {savedArtifactId === currentArtifact.id ? (
                      <>
                        <CheckCircle size={16} />
                        <span>Saved!</span>
                      </>
                    ) : currentArtifact.isSaved ? (
                      <>
                        <CheckCircle size={16} />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>{isReactProject(currentArtifact.content) ? "Save React Project" : "Save Artifact"}</span>
                      </>
                    )}
                  </button>

                  {currentArtifact.isExecutable && (
                    <button className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors">
                      <Play size={16} />
                      <span>Run Code</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Code className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-300 text-sm font-medium mb-2">
                No artifact selected
              </p>
              <p className="text-gray-400 text-xs">
                Select an artifact from the list to view its code
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeGenerationPanel;
