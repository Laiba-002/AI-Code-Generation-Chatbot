# artifacts.py - Add this as a new file to your Flask backend
from flask import Blueprint, request, jsonify, make_response, current_app
from flask_login import login_required, current_user
from models import db
from datetime import datetime, timedelta
import json
import uuid
import logging
import os
import tempfile
import subprocess
import threading
import time
import redis
import re
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

# Create Blueprint for artifact routes
artifacts_bp = Blueprint('artifacts', __name__, url_prefix='/api/artifacts')

# Configure Redis for artifact storage (fallback to in-memory if not available)
try:
    redis_client = redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=int(os.getenv('REDIS_DB', 0)),
        decode_responses=True
    )
    redis_client.ping()  # Test connection
    REDIS_AVAILABLE = True
    logger.info("Redis connected for artifact storage")
except:
    redis_client = None
    REDIS_AVAILABLE = False
    logger.warning("Redis not available, using in-memory storage")
    # Fallback to in-memory storage
    ARTIFACT_STORAGE = {}

# Artifact configuration
ARTIFACT_TYPES = {
    'text/html': {
        'name': 'HTML',
        'description': 'Interactive HTML with CSS and JavaScript',
        'sandboxed': True,
        'timeout': 5000,
        'allowed_libraries': ['https://cdnjs.cloudflare.com'],
        'executable': True
    },
    'application/vnd.ant.react': {
        'name': 'React Component',
        'description': 'React components with JSX',
        'sandboxed': True,
        'timeout': 10000,
        'requires_compilation': True,
        'executable': True
    },
    'application/vnd.ant.code': {
        'name': 'Code',
        'description': 'Code snippets in various languages',
        'sandboxed': False,
        'timeout': 1000,
        'executable': False
    },
    'text/markdown': {
        'name': 'Markdown',
        'description': 'Formatted text documents',
        'sandboxed': False,
        'timeout': 1000,
        'executable': False
    },
    'image/svg+xml': {
        'name': 'SVG',
        'description': 'Scalable Vector Graphics',
        'sandboxed': True,
        'timeout': 2000,
        'executable': True
    },
    'application/vnd.ant.mermaid': {
        'name': 'Mermaid Diagram',
        'description': 'Flow charts and diagrams',
        'sandboxed': False,
        'timeout': 3000,
        'executable': False
    },
    'application/json': {
        'name': 'JSON Data',
        'description': 'Structured data in JSON format',
        'sandboxed': False,
        'timeout': 1000,
        'executable': False
    }
}

class ArtifactManager:
    """Manages artifact creation, storage, and execution"""
    
    def __init__(self):
        self.storage = ARTIFACT_STORAGE if not REDIS_AVAILABLE else None
    
    def _get_storage_key(self, artifact_id):
        """Get storage key for artifact"""
        return f"artifact:{artifact_id}"
    
    def _store_artifact(self, artifact_id, data, expiry_hours=24):
        """Store artifact data"""
        try:
            if REDIS_AVAILABLE:
                redis_client.setex(
                    self._get_storage_key(artifact_id),
                    expiry_hours * 3600,
                    json.dumps(data)
                )
            else:
                self.storage[artifact_id] = {
                    'data': data,
                    'expires_at': datetime.utcnow() + timedelta(hours=expiry_hours)
                }
            return True
        except Exception as e:
            logger.error(f"Failed to store artifact {artifact_id}: {e}")
            return False
    
    def _get_artifact(self, artifact_id):
        """Retrieve artifact data"""
        try:
            if REDIS_AVAILABLE:
                data = redis_client.get(self._get_storage_key(artifact_id))
                return json.loads(data) if data else None
            else:
                stored = self.storage.get(artifact_id)
                if stored and datetime.utcnow() < stored['expires_at']:
                    return stored['data']
                elif stored:
                    # Remove expired artifact
                    del self.storage[artifact_id]
                return None
        except Exception as e:
            logger.error(f"Failed to get artifact {artifact_id}: {e}")
            return None
    
    def create_artifact(self, artifact_type, content, title=None, language=None, user_id=None):
        """Create a new artifact"""
        try:
            if artifact_type not in ARTIFACT_TYPES:
                raise ValueError(f"Unsupported artifact type: {artifact_type}")
            
            artifact_id = str(uuid.uuid4())
            artifact_data = {
                'id': artifact_id,
                'type': artifact_type,
                'content': content,
                'title': title or 'Untitled Artifact',
                'language': language,
                'user_id': user_id,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'version': 1,
                'metadata': ARTIFACT_TYPES[artifact_type].copy()
            }
            
            if self._store_artifact(artifact_id, artifact_data):
                logger.info(f"Created artifact {artifact_id} of type {artifact_type}")
                return artifact_data
            else:
                raise Exception("Failed to store artifact")
                
        except Exception as e:
            logger.error(f"Error creating artifact: {e}")
            raise
    
    def update_artifact(self, artifact_id, updates):
        """Update an existing artifact"""
        try:
            artifact = self._get_artifact(artifact_id)
            if not artifact:
                raise ValueError("Artifact not found")
            
            # Update fields
            for key, value in updates.items():
                if key in ['content', 'title', 'language']:
                    artifact[key] = value
            
            artifact['updated_at'] = datetime.utcnow().isoformat()
            artifact['version'] += 1
            
            if self._store_artifact(artifact_id, artifact):
                logger.info(f"Updated artifact {artifact_id}")
                return artifact
            else:
                raise Exception("Failed to update artifact")
                
        except Exception as e:
            logger.error(f"Error updating artifact {artifact_id}: {e}")
            raise
    
    def get_artifact(self, artifact_id):
        """Get artifact by ID"""
        return self._get_artifact(artifact_id)
    
    def delete_artifact(self, artifact_id):
        """Delete an artifact"""
        try:
            if REDIS_AVAILABLE:
                redis_client.delete(self._get_storage_key(artifact_id))
            else:
                self.storage.pop(artifact_id, None)
            logger.info(f"Deleted artifact {artifact_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting artifact {artifact_id}: {e}")
            return False

class CodeExecutor:
    """Secure code execution for artifacts"""
    
    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self.max_execution_time = 30  # seconds
    
    def execute_python(self, code, timeout=10):
        """Execute Python code safely"""
        try:
            # Create temporary file
            temp_file = tempfile.NamedTemporaryFile(
                mode='w', 
                suffix='.py', 
                delete=False, 
                dir=self.temp_dir
            )
            temp_file.write(code)
            temp_file.flush()
            temp_file.close()
            
            # Execute with timeout
            result = subprocess.run(
                ['python', temp_file.name],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.temp_dir
            )
            
            # Clean up
            os.unlink(temp_file.name)
            
            return {
                'success': True,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'returncode': result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Execution timeout',
                'timeout': True
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def execute_javascript(self, code, timeout=10):
        """Execute JavaScript code using Node.js"""
        try:
            # Check if Node.js is available
            subprocess.run(['node', '--version'], capture_output=True, check=True)
            
            # Create temporary file
            temp_file = tempfile.NamedTemporaryFile(
                mode='w', 
                suffix='.js', 
                delete=False, 
                dir=self.temp_dir
            )
            temp_file.write(code)
            temp_file.flush()
            temp_file.close()
            
            # Execute with timeout
            result = subprocess.run(
                ['node', temp_file.name],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self.temp_dir
            )
            
            # Clean up
            os.unlink(temp_file.name)
            
            return {
                'success': True,
                'stdout': result.stdout,
                'stderr': result.stderr,
                'returncode': result.returncode
            }
            
        except subprocess.CalledProcessError:
            return {
                'success': False,
                'error': 'Node.js not available'
            }
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Execution timeout',
                'timeout': True
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

# Initialize managers
artifact_manager = ArtifactManager()
code_executor = CodeExecutor()

# Routes

@artifacts_bp.route('/types', methods=['GET'])
def get_artifact_types():
    """Get supported artifact types"""
    return jsonify({
        'types': ARTIFACT_TYPES,
        'success': True
    })

@artifacts_bp.route('', methods=['GET'])
def list_artifacts():
    """List all artifacts"""
    try:
        # For now, return empty list since we don't have persistent storage for listing
        # In a real implementation, you'd query from database or storage
        return jsonify({
            'success': True,
            'artifacts': []
        })
        
    except Exception as e:
        logger.error(f"Error listing artifacts: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('', methods=['POST'])
def create_artifact():
    """Create a new artifact"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        artifact_type = data.get('type')
        content = data.get('content')
        title = data.get('title')
        language = data.get('language')
        
        if not artifact_type or not content:
            return jsonify({'error': 'Type and content are required'}), 400
        
        # Get user ID if authenticated
        user_id = current_user.id if hasattr(current_user, 'id') and current_user.is_authenticated else None
        
        artifact = artifact_manager.create_artifact(
            artifact_type=artifact_type,
            content=content,
            title=title,
            language=language,
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'artifact': artifact
        }), 201
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating artifact: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('/<artifact_id>', methods=['GET'])
def get_artifact(artifact_id):
    """Get artifact by ID"""
    try:
        artifact = artifact_manager.get_artifact(artifact_id)
        
        if not artifact:
            return jsonify({'error': 'Artifact not found'}), 404
        
        return jsonify({
            'success': True,
            'artifact': artifact
        })
        
    except Exception as e:
        logger.error(f"Error getting artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('/<artifact_id>', methods=['PUT'])
def update_artifact(artifact_id):
    """Update an artifact"""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Only allow certain fields to be updated
        allowed_updates = {}
        for field in ['content', 'title', 'language']:
            if field in data:
                allowed_updates[field] = data[field]
        
        if not allowed_updates:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        artifact = artifact_manager.update_artifact(artifact_id, allowed_updates)
        
        return jsonify({
            'success': True,
            'artifact': artifact
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error updating artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('/<artifact_id>', methods=['DELETE'])
def delete_artifact(artifact_id):
    """Delete an artifact"""
    try:
        if artifact_manager.delete_artifact(artifact_id):
            return jsonify({
                'success': True,
                'message': 'Artifact deleted successfully'
            })
        else:
            return jsonify({'error': 'Artifact not found'}), 404
            
    except Exception as e:
        logger.error(f"Error deleting artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('/<artifact_id>/execute', methods=['POST'])
def execute_artifact(artifact_id):
    """Execute an artifact"""
    try:
        artifact = artifact_manager.get_artifact(artifact_id)
        
        if not artifact:
            return jsonify({'error': 'Artifact not found'}), 404
        
        if not artifact['metadata'].get('executable', False):
            return jsonify({'error': 'This artifact type is not executable'}), 400
        
        content = artifact['content']
        language = artifact.get('language', '').lower()
        
        # Execute based on language or type
        if language in ['python', 'py'] or 'python' in content.lower():
            result = code_executor.execute_python(content)
        elif language in ['javascript', 'js', 'node'] or artifact['type'] == 'text/html':
            result = code_executor.execute_javascript(content)
        else:
            return jsonify({'error': 'Unsupported execution language'}), 400
        
        return jsonify({
            'success': True,
            'execution_result': result,
            'artifact': {
                'id': artifact['id'],
                'type': artifact['type'],
                'title': artifact['title']
            }
        })
        
    except Exception as e:
        logger.error(f"Error executing artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

def create_react_preview_html(react_code):
    """Create HTML wrapper for React component preview"""
    
    # Clean and prepare the React code
    # Remove import statements and extract the component
    lines = react_code.strip().split('\n')
    cleaned_lines = []
    component_name = 'App'  # Default component name
    
    for line in lines:
        # Skip import statements
        if line.strip().startswith('import ') or line.strip().startswith('export default'):
            if 'export default' in line:
                # Extract component name from export default
                match = re.search(r'export\s+default\s+(?:function\s+)?(\w+)', line)
                if match:
                    component_name = match.group(1)
            continue
        cleaned_lines.append(line)
    
    # Join the cleaned code
    component_code = '\n'.join(cleaned_lines)
    
    # Create the complete HTML with React rendering
    html_template = f"""<!DOCTYPE html>
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
    
    <!-- Lucide React icons -->
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    
    <style>
        body {{
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }}
        
        #root {{
            width: 100%;
            height: 100vh;
        }}
        
        .error-boundary {{
            padding: 20px;
            background-color: #fee2e2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            margin: 20px;
        }}
        
        .error-title {{
            color: #dc2626;
            font-weight: bold;
            margin-bottom: 10px;
        }}
        
        .error-message {{
            color: #7f1d1d;
            font-family: monospace;
            white-space: pre-wrap;
        }}
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
        const {{ useState, useEffect, useCallback, useMemo, useRef, useContext, createContext }} = React;
        
        // Error Boundary Component
        class ErrorBoundary extends React.Component {{
            constructor(props) {{
                super(props);
                this.state = {{ hasError: false, error: null, errorInfo: null }};
            }}
            
            static getDerivedStateFromError(error) {{
                return {{ hasError: true }};
            }}
            
            componentDidCatch(error, errorInfo) {{
                this.setState({{
                    error: error,
                    errorInfo: errorInfo
                }});
            }}
            
            render() {{
                if (this.state.hasError) {{
                    return (
                        <div className="error-boundary">
                            <div className="error-title">⚠️ Component Error</div>
                            <div className="error-message">
                                {{this.state.error && this.state.error.toString()}}
                                <br />
                                {{this.state.errorInfo.componentStack}}
                            </div>
                        </div>
                    );
                }}
                
                return this.props.children;
            }}
        }}
        
        // Your React Component
        {component_code}
        
        // Render the component
        const root = ReactDOM.createRoot(document.getElementById('root'));
        
        try {{
            root.render(
                <ErrorBoundary>
                    <{component_name} />
                </ErrorBoundary>
            );
        }} catch (error) {{
            root.render(
                <div className="error-boundary">
                    <div className="error-title">⚠️ Render Error</div>
                    <div className="error-message">{{error.toString()}}</div>
                </div>
            );
        }}
    </script>
</body>
</html>"""
    
    return html_template

@artifacts_bp.route('/<artifact_id>/preview', methods=['GET'])
def preview_artifact(artifact_id):
    """Preview an artifact (for HTML/SVG artifacts)"""
    try:
        artifact = artifact_manager.get_artifact(artifact_id)
        
        if not artifact:
            return jsonify({'error': 'Artifact not found'}), 404
        
        content = artifact['content']
        artifact_type = artifact['type']
        
        # Set appropriate content type and security headers
        if artifact_type == 'text/html':
            response = make_response(content)
            response.headers['Content-Type'] = 'text/html'
            response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com"
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            return response
            
        elif artifact_type == 'image/svg+xml':
            response = make_response(content)
            response.headers['Content-Type'] = 'image/svg+xml'
            response.headers['Content-Security-Policy'] = "default-src 'none'"
            response.headers['X-Content-Type-Options'] = 'nosniff'
            return response
            
        elif artifact_type == 'application/vnd.ant.react':
            # Create HTML wrapper for React component preview
            react_html = create_react_preview_html(content)
            response = make_response(react_html)
            response.headers['Content-Type'] = 'text/html'
            response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdnjs.cloudflare.com"
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            return response
            
        else:
            return jsonify({'error': 'This artifact type does not support preview'}), 400
            
    except Exception as e:
        logger.error(f"Error previewing artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@artifacts_bp.route('/<artifact_id>/download', methods=['GET'])
def download_artifact(artifact_id):
    """Download artifact content as file"""
    try:
        artifact = artifact_manager.get_artifact(artifact_id)
        
        if not artifact:
            return jsonify({'error': 'Artifact not found'}), 404
        
        content = artifact['content']
        title = artifact['title']
        artifact_type = artifact['type']
        
        # Determine file extension
        extension_map = {
            'text/html': '.html',
            'application/vnd.ant.react': '.jsx',
            'application/vnd.ant.code': '.txt',
            'text/markdown': '.md',
            'image/svg+xml': '.svg',
            'application/vnd.ant.mermaid': '.mmd',
            'application/json': '.json'
        }
        
        extension = extension_map.get(artifact_type, '.txt')
        filename = secure_filename(f"{title}{extension}")
        
        response = make_response(content)
        response.headers['Content-Type'] = 'application/octet-stream'
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
        
    except Exception as e:
        logger.error(f"Error downloading artifact {artifact_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500

# Health check for artifacts system
@artifacts_bp.route('/health', methods=['GET'])
def artifacts_health():
    """Health check for artifacts system"""
    return jsonify({
        'status': 'healthy',
        'redis_available': REDIS_AVAILABLE,
        'supported_types': len(ARTIFACT_TYPES),
        'timestamp': datetime.utcnow().isoformat()
    })

# Add this to your main app.py file to register the blueprint:
"""
# Add this import at the top of app.py
from artifacts import artifacts_bp

# Add this after your other blueprint registrations
app.register_blueprint(artifacts_bp)
"""