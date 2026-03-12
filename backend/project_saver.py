# project_saver.py - Handles saving React projects to the projects folder
import os
import json
import uuid
import logging
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

class ReactProjectSaver:
    """Handles saving React projects with Vite structure to the projects folder"""
    
    def __init__(self, projects_base_path=None):
        if projects_base_path is None:
            # Use absolute path relative to the backend directory
            backend_dir = Path(__file__).parent
            projects_base_path = backend_dir / "projects"
        self.projects_base_path = Path(projects_base_path)
        self.projects_base_path.mkdir(exist_ok=True)
    
    def generate_project_name(self, content):
        """Generate a random project name based on content"""
        # Extract potential app name from content
        app_name_patterns = [
            r'<title>([^<]+)</title>',
            r'"name":\s*"([^"]+)"',
            r'My\s+(\w+)\s+App',
            r'(\w+)\s+Application',
            r'(\w+)\s+Dashboard',
            r'(\w+)\s+Manager'
        ]
        
        for pattern in app_name_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                base_name = match.group(1).lower().replace(' ', '-')
                # Clean the name
                base_name = re.sub(r'[^a-z0-9-]', '', base_name)
                if base_name and len(base_name) > 2:
                    return f"{base_name}-{uuid.uuid4().hex[:8]}"
        
        # Fallback to generic name
        return f"react-app-{uuid.uuid4().hex[:8]}"
    
    def parse_react_project_files(self, content):
        """Parse the generated content to extract individual files"""
        files = {}
        
        # First try to extract from structured content (numbered sections)
        files = self._extract_from_structured_content(content)
        
        # If that didn't work, try direct code block patterns
        if not files:
            file_patterns = {
                'index.html': r'```html\s*\n(.*?)\n```',
                'package.json': r'```json\s*\n(.*?)\n```',
                'vite.config.js': r'```javascript\s*\n(.*?)\n```',
                'src/main.jsx': r'```jsx\s*\n(.*?)\n```',
                'src/App.jsx': r'```jsx\s*\n(.*?)\n```',
                'public/favicon.svg': r'```svg\s*\n(.*?)\n```'
            }
            
            # Try to extract files from code blocks
            for file_path, pattern in file_patterns.items():
                matches = re.findall(pattern, content, re.DOTALL | re.IGNORECASE)
                if matches:
                    # Take the last match (most likely the correct one)
                    files[file_path] = matches[-1].strip()
        
        # If still no files, try alternative patterns
        if not files:
            files = self._extract_alternative_patterns(content)
        
        return files
    
    def _extract_from_structured_content(self, content):
        """Extract files from structured content format"""
        files = {}
        
        # Look for file headers like "1. **index.html**" or "**index.html** - Main HTML entry point:"
        file_sections = re.split(r'\n\s*\d+\.\s*\*\*([^*]+)\*\*', content)
        
        if len(file_sections) > 1:
            for i in range(1, len(file_sections), 2):
                if i + 1 < len(file_sections):
                    file_name = file_sections[i].strip()
                    file_content = file_sections[i + 1].strip()
                    
                    # Extract code from markdown code blocks
                    code_match = re.search(r'```(?:html|json|javascript|jsx|svg)?\s*\n(.*?)\n```', 
                                         file_content, re.DOTALL)
                    if code_match:
                        # Clean the file name (remove numbers and extra spaces)
                        clean_file_name = re.sub(r'^\d+\.\s*', '', file_name).strip()
                        files[clean_file_name] = code_match.group(1).strip()
        
        # Also try patterns like "**index.html**" without numbers
        if not files:
            file_headers = re.findall(r'\*\*([^*]+\.(?:html|json|js|jsx|svg))\*\*', content)
            for header in file_headers:
                # Find the content after this header
                pattern = rf'\*\*{re.escape(header)}\*\*[^\n]*\n(.*?)(?=\*\*|\Z)'
                match = re.search(pattern, content, re.DOTALL)
                if match:
                    section_content = match.group(1).strip()
                    # Extract code from markdown code blocks
                    code_match = re.search(r'```(?:html|json|javascript|jsx|svg)?\s*\n(.*?)\n```', 
                                         section_content, re.DOTALL)
                    if code_match:
                        # Clean the file name (remove numbers and extra spaces)
                        clean_file_name = re.sub(r'^\d+\.\s*', '', header).strip()
                        files[clean_file_name] = code_match.group(1).strip()
        
        return files
    
    def _extract_alternative_patterns(self, content):
        """Extract files using alternative patterns"""
        files = {}
        
        # Look for any code blocks and try to identify file types
        code_blocks = re.findall(r'```(\w+)?\s*\n(.*?)\n```', content, re.DOTALL)
        
        for lang, code in code_blocks:
            code = code.strip()
            if not code:
                continue
                
            # Try to identify file type based on content
            if lang == 'html' or '<!doctype html>' in code.lower() or '<html' in code.lower():
                files['index.html'] = code
            elif lang == 'json' or code.strip().startswith('{') and code.strip().endswith('}'):
                files['package.json'] = code
            elif lang == 'javascript' and 'vite' in code.lower():
                files['vite.config.js'] = code
            elif lang == 'jsx' and 'reactdom' in code.lower() and 'createroot' in code.lower():
                files['src/main.jsx'] = code
            elif lang == 'jsx' and ('function app' in code.lower() or 'const app' in code.lower()):
                files['src/App.jsx'] = code
            elif lang == 'svg' or '<svg' in code.lower():
                files['public/favicon.svg'] = code
        
        return files
    
    def create_default_files(self, project_name):
        """Create default Vite project files if not provided"""
        return {
            'index.html': f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{project_name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>''',
            
            'package.json': json.dumps({
                "name": project_name,
                "private": True,
                "version": "0.0.0",
                "type": "module",
                "scripts": {
                    "dev": "vite",
                    "build": "vite build",
                    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
                    "preview": "vite preview"
                },
                "dependencies": {
                    "react": "^18.2.0",
                    "react-dom": "^18.2.0"
                },
                "devDependencies": {
                    "@types/react": "^18.2.66",
                    "@types/react-dom": "^18.2.22",
                    "@vitejs/plugin-react": "^4.2.1",
                    "eslint": "^8.57.0",
                    "eslint-plugin-react": "^7.34.1",
                    "eslint-plugin-react-hooks": "^4.6.0",
                    "eslint-plugin-react-refresh": "^0.4.6",
                    "vite": "^5.2.0"
                }
            }, indent=2),
            
            'vite.config.js': '''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})''',
            
            'src/main.jsx': '''import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)''',
            
            'public/favicon.svg': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
  <path d="M2 17l10 5 10-5"/>
  <path d="M2 12l10 5 10-5"/>
</svg>'''
        }
    
    def save_react_project(self, content, user_id=None):
        """Save a React project to the projects folder"""
        try:
            # Generate project name
            project_name = self.generate_project_name(content)
            project_path = self.projects_base_path / project_name
            
            # Create project directory
            project_path.mkdir(exist_ok=True)
            
            # Parse files from content
            files = self.parse_react_project_files(content)
            
            # If no files parsed, create default structure
            if not files:
                logger.warning("No files parsed from content, creating default structure")
                files = self.create_default_files(project_name)
                # Try to extract App.jsx from the main content
                app_content = self._extract_app_content(content)
                if app_content:
                    files['src/App.jsx'] = app_content
            
            # Ensure we have App.jsx
            if 'src/App.jsx' not in files:
                app_content = self._extract_app_content(content)
                if app_content:
                    files['src/App.jsx'] = app_content
                else:
                    files['src/App.jsx'] = '''import React from 'react'

function App() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Welcome to React!</h1>
      <p>Your React app is ready to go.</p>
    </div>
  )
}

export default App'''
            
            # Create directory structure and write files
            created_files = []
            for file_path, file_content in files.items():
                full_path = project_path / file_path
                
                # Create parent directories
                full_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Write file
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(file_content)
                
                created_files.append(str(file_path))
                logger.info(f"Created file: {full_path}")
            
            # Create project metadata
            metadata = {
                'project_name': project_name,
                'project_path': str(project_path),
                'created_at': datetime.utcnow().isoformat(),
                'user_id': user_id,
                'files': created_files,
                'type': 'react-vite'
            }
            
            # Save metadata
            metadata_path = project_path / 'project.json'
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Successfully created React project: {project_name}")
            return {
                'success': True,
                'project_name': project_name,
                'project_path': str(project_path),
                'files': created_files,
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"Error saving React project: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _extract_app_content(self, content):
        """Extract App.jsx content from the main content"""
        # Look for React component code
        patterns = [
            r'```jsx\s*\n(.*?function\s+App.*?)\n```',
            r'```jsx\s*\n(.*?const\s+App.*?)\n```',
            r'```jsx\s*\n(.*?export\s+default.*?)\n```',
            r'```jsx\s*\n(.*?)\n```'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content, re.DOTALL | re.IGNORECASE)
            if matches:
                # Find the match that looks most like a complete App component
                for match in matches:
                    if ('function App' in match or 'const App' in match or 'export default' in match) and 'import React' in match:
                        return match.strip()
        
        return None
    
    def list_projects(self, user_id=None):
        """List all projects in the projects folder"""
        try:
            projects = []
            for project_dir in self.projects_base_path.iterdir():
                if project_dir.is_dir():
                    metadata_path = project_dir / 'project.json'
                    if metadata_path.exists():
                        with open(metadata_path, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)
                        
                        # Filter by user if specified
                        if user_id is None or metadata.get('user_id') == user_id:
                            projects.append(metadata)
            
            return projects
        except Exception as e:
            logger.error(f"Error listing projects: {e}")
            return []
    
    def get_project(self, project_name):
        """Get project details by name"""
        try:
            project_path = self.projects_base_path / project_name
            metadata_path = project_path / 'project.json'
            
            if metadata_path.exists():
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            logger.error(f"Error getting project {project_name}: {e}")
            return None

# Global instance
project_saver = ReactProjectSaver()
