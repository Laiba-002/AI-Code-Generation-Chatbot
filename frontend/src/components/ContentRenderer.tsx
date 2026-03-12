import Editor from "@monaco-editor/react";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChatChunkMetadata } from "../types";

interface ContentRendererProps {
  msgid: string;
  content: string;
  metadata?: ChatChunkMetadata;
  hideCodeBlocks?: boolean;
  onArtifactClick?: (artifactId: string) => void;
  onToggleCodePanel?: (msgID: any) => void;
}

const ContentRenderer: React.FC<ContentRendererProps> = ({
  msgid,
  content,
  metadata,
  hideCodeBlocks = false,
  onArtifactClick,
  onToggleCodePanel,
}) => {
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [showArtifactPreview, setShowArtifactPreview] = useState(false);
  const [artifactPreviewUrl, setArtifactPreviewUrl] = useState<string>("");

  // Function to detect if content contains code blocks
  // const detectCodeBlocks = (text: string) => {
  //   console.log('this is content to detect the text----->',text)
  //   const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  //   const matches = [];
  //   let match;

  //   while ((match = codeBlockRegex.exec(text)) !== null) {
  //     matches.push({
  //       language: match[1] || 'text',
  //       code: match[2],
  //       fullMatch: match[0]
  //     });
  //   }

  //   return matches;
  // };
  const detectCodeBlocks = (text: string) => {
    const matches: { language: string; code: string; fullMatch: string }[] = [];

    // ✅ Detect complete blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push({
        language: match[1] || "text",
        code: match[2],
        fullMatch: match[0],
      });
    }

    // ✅ Detect incomplete/streaming blocks
    const incompleteCodeBlockRegex = /```(\w+)?\n([\s\S]*)$/g;
    let incompleteMatch: any;
    while ((incompleteMatch = incompleteCodeBlockRegex.exec(text)) !== null) {
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

  // Function to create HTML preview for executable code
  const createHTMLPreview = (content: string, isReact?: boolean) => {
    let fullHTML = "";

    // Check if it's React/JSX content
    const isReactComponent =
      isReact ||
      content.includes("React") ||
      content.includes("useState") ||
      content.includes("jsx") ||
      content.includes("function App") ||
      (content.includes("<") && content.includes("/>"));

    if (isReactComponent) {
      // Create React preview HTML
      fullHTML = createReactPreviewHTML(content);
    } else {
      // Regular HTML content
      fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Code Preview</title>
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

  // Function to handle artifact creation and preview
  const handleArtifactCreate = async (
    content: string,
    type: string,
    language?: string
  ) => {
    try {
      const response = await fetch("/api/artifacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: type,
          content: content,
          title: `Code Artifact - ${language || "Unknown"}`,
          language: language,
        }),
      });

      if (response.ok) {
        const artifact = await response.json();

        // Create preview URL for executable artifacts
        if (type === "text/html") {
          const previewUrl = createHTMLPreview(content);
          setArtifactPreviewUrl(previewUrl);
          setShowArtifactPreview(true);
        }

        // Call the callback if provided
        if (onArtifactClick) {
          onArtifactClick(artifact.id);
        }

        return artifact;
      }
    } catch (error) {
      console.error("Failed to create artifact:", error);
    }
  };

  // Render based on content type
  if (metadata?.is_code_block) {
    const codeBlocks = detectCodeBlocks(content);

    // If hideCodeBlocks is true, show text content + success message, but not code blocks
    //  if (hideCodeBlocks) {
    //    return (
    //      <div className="space-y-4">
    //        {/* Render text content before code blocks */}
    //        {content.split(/```[\s\S]*?(?:```|$)/).map((text, index) => (
    //          text.trim() && (
    //            <div key={`text-${index}`} className="text-xl leading-relaxed whitespace-pre-wrap">
    //              {text}
    //            </div>
    //          )
    //        ))}

    //                    {/* Show a message that code is available in the side panel */}
    //         {codeBlocks.length > 0 && (
    //           <div
    //             className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 cursor-pointer hover:bg-blue-500/20 transition-all duration-200 hover:scale-[1.02] group"
    //             onClick={onToggleCodePanel}
    //             title="Click to open code panel"
    //           >
    //             <div className="flex items-center space-x-3">
    //               <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
    //                 <span className="text-blue-400 text-lg">💻</span>
    //               </div>
    //               <div className="flex-1">
    //                 <div className="flex items-center space-x-2">
    //                   <span className="text-blue-400 font-semibold">
    //                     Code Generated Successfully!
    //                   </span>
    //                   <div className="flex space-x-1">
    //                     <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
    //                     <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
    //                     <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
    //                   </div>
    //                 </div>
    //                 <p className="text-blue-300 text-sm mt-1">
    //                   {codeBlocks.length} code block{codeBlocks.length > 1 ? 's' : ''} available in slide window →
    //                 </p>
    //                 <p className="text-blue-200 text-xs mt-2 flex items-center">
    //                   <span className="mr-1">Click to view</span>
    //                   <span className="text-blue-300 group-hover:translate-x-1 transition-transform duration-200">→</span>
    //                 </p>
    //               </div>
    //             </div>
    //           </div>
    //         )}
    //      </div>
    //    );
    //  }
    if (true) {
      return (
        <div className="space-y-4">
          {/* Render only explanatory text, exclude code blocks */}
          {(() => {
            const textParts = [];
            const codeBlockRegex = /```[\s\S]*?(?:```|$)/g;
            let lastIndex = 0;
            let match;
            let partIndex = 0;

            // Split content into text parts, excluding code blocks
            while ((match = codeBlockRegex.exec(content)) !== null) {
              // Add text before this code block
              if (match.index > lastIndex) {
                const textBefore = content
                  .substring(lastIndex, match.index)
                  .trim();
                if (textBefore) {
                  textParts.push(
                    <div
                      key={`text-${partIndex++}`}
                      className="text-base leading-relaxed prose prose-invert max-w-none"
                    >
                      <ReactMarkdown>{textBefore}</ReactMarkdown>
                    </div>
                  );
                }
              }
              lastIndex = match.index + match[0].length;
            }

            // Add any remaining text after the last code block
            if (lastIndex < content.length) {
              const textAfter = content.substring(lastIndex).trim();
              if (textAfter) {
                textParts.push(
                  <div
                    key={`text-${partIndex++}`}
                    className="text-base leading-relaxed prose prose-invert max-w-none"
                  >
                    <ReactMarkdown>{textAfter}</ReactMarkdown>
                  </div>
                );
              }
            }

            return textParts;
          })()}

          {/* Show a message that code is available in the side panel
          {codeBlocks.length > 0 && (
            <div
              className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 cursor-pointer hover:bg-blue-500/20 transition-all duration-200 hover:scale-[1.02] group"
              onClick={() => {
                onArtifactClick?.(msgid);
                onToggleCodePanel?.(msgid);
              }}
              title="Click to open code panel"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                  <span className="text-blue-400 text-lg">💻</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-400 font-semibold">
                      Code Generated Successfully!
                    </span>
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
                      <div
                        className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                  <p className="text-blue-300 text-sm mt-1">
                    {codeBlocks.length} code block
                    {codeBlocks.length > 1 ? "s" : ""} available in slide window
                    →
                  </p>
                  <p className="text-blue-200 text-xs mt-2 flex items-center">
                    // <span className="mr-1">Click to view</span>
                    // <span className="text-blue-300 group-hover:translate-x-1 transition-transform duration-200">
                      // →
                    // </span>
                  </p>
                </div>
              </div>
            </div>
          )} */}
        </div>
      );
    }

    // // If we have code blocks, render them with special formatting
    else if (codeBlocks.length > 0) {
      return (
        <div className="space-y-4">
          {/* Render text content before code blocks */}
          {content.split(/```[\s\S]*?```/).map(
            (text, index) =>
              text.trim() && (
                <div
                  key={`text-${index}`}
                  className="text-base leading-relaxed prose prose-invert max-w-none"
                >
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              )
          )}

          {/* Render code blocks */}
          {codeBlocks.map((block, index) => (
            <div
              key={`code-${index}`}
              className="bg-gray-900 rounded-lg overflow-hidden"
            >
              {/* Code block header */}
              <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-300">
                    {block.language.toUpperCase()}
                  </span>
                  {metadata?.is_executable && (
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                      Executable
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {/* Copy button */}
                  <button
                    onClick={() => navigator.clipboard.writeText(block.code)}
                    className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
                  >
                    Copy
                  </button>

                  {/* Create Artifact button */}
                  <button
                    onClick={() =>
                      handleArtifactCreate(
                        block.code,
                        metadata?.content_type === "html"
                          ? "text/html"
                          : "application/vnd.ant.code",
                        block.language
                      )
                    }
                    className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 rounded hover:bg-gray-700"
                  >
                    Create Artifact
                  </button>

                  {/* Preview button for executable code */}
                  {(metadata?.is_executable ||
                    block.language === "html" ||
                    block.language === "jsx" ||
                    block.language === "tsx" ||
                    block.code.includes("<!DOCTYPE html>") ||
                    block.code.includes("<html") ||
                    block.code.includes("React") ||
                    block.code.includes("useState")) && (
                    <button
                      onClick={() => {
                        const previewUrl = createHTMLPreview(block.code);
                        setArtifactPreviewUrl(previewUrl);
                        setShowCodePreview(true);
                      }}
                      className="text-green-400 hover:text-green-300 text-sm px-2 py-1 rounded hover:bg-gray-700"
                    >
                      Preview
                    </button>
                  )}
                </div>
              </div>

              {/* Code content with Monaco Editor */}
              <div className="overflow-hidden rounded-lg">
                <Editor
                  height="300px"
                  language={block.language}
                  value={block.code}
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
              </div>
            </div>
          ))}

          {/* Code Preview Modal */}
          {showCodePreview && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-11/12 h-5/6 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold">Code Preview</h3>
                  <button
                    onClick={() => {
                      setShowCodePreview(false);
                      URL.revokeObjectURL(artifactPreviewUrl);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  src={artifactPreviewUrl}
                  className="flex-1 w-full"
                  title="Code Preview"
                />
              </div>
            </div>
          )}

          {/* Artifact Preview Modal */}
          {showArtifactPreview && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-11/12 h-5/6 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold">Artifact Preview</h3>
                  <button
                    onClick={() => {
                      setShowArtifactPreview(false);
                      URL.revokeObjectURL(artifactPreviewUrl);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  src={artifactPreviewUrl}
                  className="flex-1 w-full"
                  title="Artifact Preview"
                />
              </div>
            </div>
          )}
        </div>
      );
    } else {
      // No code blocks detected but content is marked as code
      // If hideCodeBlocks is true, show text content + success message, but not the code
      if (hideCodeBlocks) {
        return (
          <div className="space-y-4">
            {/* Show the text content (explanation) */}
            <div className="text-base leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>

            {/* Show a message that code is available in the side panel */}
            <div
              className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 cursor-pointer hover:bg-blue-500/20 transition-all duration-200 hover:scale-[1.02] group"
              onClick={onToggleCodePanel}
              title="Click to open code panel"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                  <span className="text-blue-400 text-lg">💻</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-400 font-semibold">
                      Code Generated Successfully!
                    </span>
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
                      <div
                        className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                  <p className="text-blue-300 text-sm mt-1">
                    Interactive artifact
                  </p>
                  <p className="text-blue-200 text-xs mt-2 flex items-center">
                    {/* <span className="mr-1">Click to view</span> */}
                    {/* <span className="text-blue-300 group-hover:translate-x-1 transition-transform duration-200"> */}
                    {/* → */}
                    {/* </span> */}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      }

      // Render as a single code block
      return (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            {/* Code block header */}
            <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-300">
                  {metadata?.language?.toUpperCase() || "CODE"}
                </span>
                {metadata?.is_executable && (
                  <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                    Executable
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Copy button */}
                <button
                  onClick={() => navigator.clipboard.writeText(content)}
                  className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
                >
                  Copy
                </button>

                {/* Create Artifact button */}
                <button
                  onClick={() =>
                    handleArtifactCreate(
                      content,
                      metadata?.content_type === "html"
                        ? "text/html"
                        : "application/vnd.ant.code",
                      metadata?.language
                    )
                  }
                  className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 rounded hover:bg-gray-700"
                >
                  Create Artifact
                </button>

                {/* Preview button for executable code */}
                {(metadata?.is_executable ||
                  metadata?.language === "html" ||
                  metadata?.language === "jsx" ||
                  metadata?.language === "tsx" ||
                  content.includes("<!DOCTYPE html>") ||
                  content.includes("<html") ||
                  content.includes("React") ||
                  content.includes("useState")) && (
                  <button
                    onClick={() => {
                      const previewUrl = createHTMLPreview(content);
                      setArtifactPreviewUrl(previewUrl);
                      setShowCodePreview(true);
                    }}
                    className="text-green-400 hover:text-green-300 text-sm px-2 py-1 rounded hover:bg-gray-700"
                  >
                    Preview
                  </button>
                )}
              </div>
            </div>

            {/* Code content */}
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{content}</code>
            </pre>
          </div>

          {/* Code Preview Modal */}
          {showCodePreview && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-11/12 h-5/6 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold">Code Preview</h3>
                  <button
                    onClick={() => {
                      setShowCodePreview(false);
                      URL.revokeObjectURL(artifactPreviewUrl);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  src={artifactPreviewUrl}
                  className="flex-1 w-full"
                  title="Code Preview"
                />
              </div>
            </div>
          )}

          {/* Artifact Preview Modal */}
          {showArtifactPreview && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-11/12 h-5/6 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="text-lg font-semibold">Artifact Preview</h3>
                  <button
                    onClick={() => {
                      setShowArtifactPreview(false);
                      URL.revokeObjectURL(artifactPreviewUrl);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  src={artifactPreviewUrl}
                  className="flex-1 w-full"
                  title="Artifact Preview"
                />
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  // For simple text responses
  return (
    <div className="space-y-4">
      {/* Render only explanatory text, exclude code blocks */}
      {(() => {
        const textParts = [];
        const codeBlockRegex = /```[\s\S]*?(?:```|$)/g;
        let lastIndex = 0;
        let match;
        let partIndex = 0;

        // Split content into text parts, excluding code blocks
        while ((match = codeBlockRegex.exec(content)) !== null) {
          // Add text before this code block
          if (match.index > lastIndex) {
            const textBefore = content.substring(lastIndex, match.index).trim();
            if (textBefore) {
              textParts.push(
                <div
                  key={`text-${partIndex++}`}
                  className="text-base leading-relaxed prose prose-invert max-w-none"
                >
                  <ReactMarkdown>{textBefore}</ReactMarkdown>
                </div>
              );
            }
          }
          lastIndex = match.index + match[0].length;
        }

        // Add any remaining text after the last code block
        if (lastIndex < content.length) {
          const textAfter = content.substring(lastIndex).trim();
          if (textAfter) {
            textParts.push(
              <div
                key={`text-${partIndex++}`}
                className="text-base leading-relaxed prose prose-invert max-w-none"
              >
                <ReactMarkdown>{textAfter}</ReactMarkdown>
              </div>
            );
          }
        }

        // If no code blocks were found, just render the whole content
        if (textParts.length === 0) {
          textParts.push(
            <div
              key="full-content"
              className="text-base leading-relaxed prose prose-invert max-w-none"
            >
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          );
        }

        return textParts;
      })()}
    </div>
  );
};

export default ContentRenderer;
