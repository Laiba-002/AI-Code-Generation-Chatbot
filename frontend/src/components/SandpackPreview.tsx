import {
  SandpackCodeEditor,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import { atomDark } from "@codesandbox/sandpack-themes";
import React from "react";

// Function to extract third-party dependencies from code
const extractDependencies = (code: string): Record<string, string> => {
  const dependencies: Record<string, string> = {};

  // Common React-related packages that should be excluded (already provided by template)
  const excludedPackages = new Set([
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
  ]);

  // Regex to match import statements
  const importRegex =
    /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const packageName = match[1];

    // Skip relative imports and excluded packages
    if (
      !packageName.startsWith(".") &&
      !packageName.startsWith("/") &&
      !excludedPackages.has(packageName)
    ) {
      dependencies[packageName] = "latest";
    }
  }

  return dependencies;
};

interface SandpackPreviewProps {
  code: string;
  type?: string;
  showEditor?: boolean;
  height?: string;
}

const SandpackPreviewComponent: React.FC<SandpackPreviewProps> = ({
  code,
  type = "react",
  showEditor = false,
}) => {
  // Force re-render when code changes by using a key
  const [key, setKey] = React.useState(0);

  React.useEffect(() => {
    setKey((prev) => prev + 1);
  }, [code]);

  // Determine if this is React code
  const isReactCode = type === "react";

  // Use the provided code directly
  const displayCode = code;

  // Extract dynamic dependencies from the code
  const dynamicDependencies = extractDependencies(displayCode);

  if (!isReactCode || !displayCode) {
    // For non-React code or empty code, show a simple message
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📄</span>
          </div>
          <p className="text-gray-600 text-sm font-medium mb-2">
            Preview not available
          </p>
          <p className="text-gray-500 text-xs">
            {!displayCode
              ? "No code provided"
              : "Sandpack preview is only available for React code"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <SandpackProvider
        key={key}
        template="react"
        theme={atomDark}
        files={{
          "/App.js": displayCode,
        }}
        customSetup={{
          dependencies: dynamicDependencies,
        }}
        options={{
          externalResources: [
            "https://cdn.tailwindcss.com?plugins=forms,typography",
          ],
        }}
      >
        <SandpackLayout>
          {showEditor && <SandpackCodeEditor />}
          <SandpackPreview
            showRefreshButton={true}
            showOpenInCodeSandbox={true}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
};

export default SandpackPreviewComponent;
