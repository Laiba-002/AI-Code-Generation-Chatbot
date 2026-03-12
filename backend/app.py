from flask import Flask, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from flask_login import LoginManager, login_required, current_user, login_user, logout_user
import ollama
import json
import logging
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from models import db, User, ChatSession, ChatMessage
from auth import init_auth, get_user_chat_sessions, create_chat_session, save_chat_message, get_chat_messages, delete_chat_session
from jwt_auth import jwt_auth, jwt_required, get_current_user, register_user, login_user_by_credentials
from oauth import init_oauth, handle_google_oauth, handle_github_oauth
from artifacts import artifacts_bp
from project_saver import project_saver
import threading
import re
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global dictionary to track active streaming sessions
active_streams = {}
stream_locks = {}

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///chatbot.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# OAuth configuration
app.config['PREFERRED_URL_SCHEME'] = 'http'
app.config['SERVER_NAME'] = 'localhost:5000'

# Session configuration
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)  # Sessions last 7 days
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Initialize extensions
db.init_app(app)
init_auth(app)
jwt_auth.init_app(app)
init_oauth(app)

# Register blueprints
app.register_blueprint(artifacts_bp)

# Configure login manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = None  # Disable automatic redirects since we're using JWT

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({'error': 'Authentication required'}), 401

# Configure CORS
# CORS(app, resources={
#     r"/api/*": {
#         "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
#         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
#         "allow_headers": ["Content-Type", "Authorization"],
#         "supports_credentials": True
#     }
# })
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Configure SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Token configuration - No token limit for unlimited responses
DEFAULT_TOKEN_LIMITS = {
    # 'num_predict': -1,  # -1 means unlimited, but some models don't support this
    'temperature': 0.7,
    'top_p': 0.9,
    'repeat_penalty': 1.15,
    'top_k': 40,
    'stop': ['###']
}

# Password reset token serializer
reset_serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])

def generate_reset_token(user_id):
    """Generate password reset token"""
    return reset_serializer.dumps(user_id, salt='password-reset-salt')

def verify_reset_token(token, expiration=3600):
    """Verify password reset token (expires in 1 hour)"""
    try:
        user_id = reset_serializer.loads(token, salt='password-reset-salt', max_age=expiration)
        return user_id
    except:
        return None

# Available models configuration
AVAILABLE_MODELS = [
    {
        "id": "qwen2.5-coder:7b",
        "name": "Qwen 2.5 Coder 7B",
        "description": "Specialized for code generation and speed",
        "category": "Code Generation"
    },
    {
        "id": "llama3.2:3b",
        "name": "Llama 3.2 3B",
        "description": "Fast and lightweight",
        "category": "General"
    },
    {
        "id": "codellama:7b",
        "name": "Code Llama 7B",
        "description": "Specialized for code generation",
        "category": "Code"
    },
    {
        "id": "mistral:7b",
        "name": "Mistral 7B",
        "description": "Excellent general-purpose model",
        "category": "General"
    },
    {
        "id": "qwen3:8b",
        "name": "Qwen 3 8B",
        "description": "Efficient model for code generation",
        "category": "Code Generation"
    },  
    {
        "id": "llama3.1:8b",
        "name": "Llama 3.1 8B",
        "description": "Latest Llama model with improved performance",
        "category": "General"
    }
]

def check_ollama_connection():
    """Check if Ollama is running and accessible"""
    try:
        response = ollama.list()
        return True
    except Exception as e:
        logger.error(f"Ollama connection failed: {e}")
        return False

def get_available_models():
    """Get list of models available in Ollama"""
    try:
        models = ollama.list()
        return [model['name'] for model in models['models']]
    except Exception as e:
        logger.error(f"Failed to get Ollama models: {e}")
        return []
def load_system_prompt():
    """Load the system prompt from file"""
    try:
        # Try multiple possible paths to find the prompt file
        possible_paths = [
            os.path.join(os.path.dirname(__file__), 'system_prompts', 'code_generation_prompt.txt'),
            os.path.join(os.getcwd(), 'backend', 'system_prompts', 'code_generation_prompt.txt'),
            os.path.join(os.getcwd(), 'system_prompts', 'code_generation_prompt.txt'),
            'backend/system_prompts/code_generation_prompt.txt',
            'system_prompts/code_generation_prompt.txt'
        ]
        
        for prompt_file in possible_paths:
            if os.path.exists(prompt_file):
                logger.info(f"Loading system prompt from: {prompt_file}")
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:  # Make sure file isn't empty
                        return content
                    else:
                        logger.warning(f"System prompt file is empty: {prompt_file}")
        
        # If no file found, log the attempted paths
        logger.error(f"System prompt file not found. Tried paths: {possible_paths}")
        logger.error(f"Current working directory: {os.getcwd()}")
        logger.error(f"Script directory: {os.path.dirname(__file__)}")
        
        # Fallback to default prompt
        return get_default_system_prompt()
        
    except Exception as e:
        logger.error(f"Failed to load system prompt: {e}")
        return get_default_system_prompt()

def get_default_system_prompt():
    """Get the default system prompt"""
    return """You are an AI coding assistant. Help users with code generation, debugging, and programming questions. Provide clear, concise, and well-documented code examples."""

def get_stream_key(session_id, user_id=None):
    """Generate a unique key for tracking streaming sessions"""
    if user_id:
        return f"{user_id}_{session_id}"
    return f"anonymous_{session_id}"

def stop_streaming(session_id, user_id=None):
    """Stop an active streaming session"""
    stream_key = get_stream_key(session_id, user_id)
    if stream_key in active_streams:
        active_streams[stream_key] = False
        logger.info(f"Stopped streaming for session {session_id}")
        return True
    return False

def is_streaming_stopped(session_id, user_id=None):
    """Check if streaming has been stopped for a session"""
    stream_key = get_stream_key(session_id, user_id)
    return not active_streams.get(stream_key, True)

def cleanup_stream_session(session_id, user_id=None):
    """Clean up streaming session tracking"""
    stream_key = get_stream_key(session_id, user_id)
    if stream_key in active_streams:
        del active_streams[stream_key]
    if stream_key in stream_locks:
        del stream_locks[stream_key]
    logger.info(f"Cleaned up streaming session {session_id}")

def create_new_chat_session(user_id=None):
    """Create a new chat session and return session info"""
    try:
        if user_id:
            session_id = create_chat_session(user_id)
            if session_id:
                return {
                    'success': True,
                    'session_id': session_id,
                    'message': 'New chat session created successfully'
                }
            else:
                return {
                    'success': False,
                    'message': 'Failed to create new chat session'
                }
        else:
            # For anonymous users, return a temporary session ID
            temp_session_id = f"temp_{datetime.now().timestamp()}"
            return {
                'success': True,
                'session_id': temp_session_id,
                'message': 'New temporary chat session created'
            }
    except Exception as e:
        logger.error(f"Error creating new chat session: {e}")
        return {
            'success': False,
            'message': f'Error creating new chat session: {str(e)}'
        }

@app.route('/')
def index():
    """Root endpoint with API information"""
    return jsonify({
        'message': 'Ollama Chatbot API Server',
        'version': '1.0.0',
        'status': 'running',
        'ollama_connected': check_ollama_connection(),
        'endpoints': {
            'health': '/api/health - GET',
            'models': '/api/models - GET',
            'chat': '/api/chat - POST',
            'upload': '/api/upload - POST',
            'token_config': '/api/token-config - GET/POST',
            'context_debug': '/api/context-debug/<session_id> - GET',  
            'auth': {
                'register': '/api/auth/register - POST',
                'login': '/api/auth/login - POST',
                'logout': '/api/auth/logout - POST',
                'profile': '/api/auth/profile - GET'
            },
            'sessions': {
                'list': '/api/sessions - GET',
                'create': '/api/sessions - POST',
                'messages': '/api/sessions/<id>/messages - GET',
                'delete': '/api/sessions/<id> - DELETE'
            }
        },
        'websocket_events': {
            'connect': 'Client connection',
            'chat_message': 'Send chat message',
            'model_change': 'Change AI model'
        },
        'timestamp': datetime.now().isoformat()
    })

# Authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not all([email, username, password]):
            return jsonify({'error': 'Email, username, and password are required'}), 400
        
        success, message = register_user(email, username, password)
        
        if success:
            return jsonify({
                'message': message,
                'success': True
            }), 201
        else:
            return jsonify({
                'error': message,
                'success': False
            }), 400
            
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user with JWT tokens"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        if not all([email, password]):
            return jsonify({'error': 'Email and password are required'}), 400
        
        success, result = login_user_by_credentials(email, password)
        
        if success:
            return jsonify({
                'message': 'Login successful',
                'success': True,
                'user': result['user'],
                'tokens': result['tokens']
            }), 200
        else:
            return jsonify({
                'error': result,
                'success': False
            }), 401
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/logout', methods=['POST'])
@jwt_required
def logout():
    """Logout user and revoke JWT session"""
    try:
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
            # Decode token to get session ID
            import jwt
            payload = jwt.decode(
                token, 
                app.config['JWT_SECRET_KEY'], 
                algorithms=[app.config['JWT_ALGORITHM']]
            )
            session_id = payload.get('session_id')
            
            # Revoke session
            if session_id:
                jwt_auth.revoke_session(session_id)
        
        return jsonify({
            'message': 'Logged out successfully',
            'success': True
        }), 200
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return jsonify({'error': 'Logout failed'}), 500

@app.route('/api/auth/profile', methods=['GET'])
@jwt_required
def profile():
    """Get user profile"""
    try:
        user = get_current_user()
        return jsonify({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'created_at': user.created_at.isoformat(),
                'last_login': user.last_login.isoformat()
            },
            'success': True
        }), 200
    except Exception as e:
        logger.error(f"Profile error: {e}")
        return jsonify({'error': 'Failed to get profile'}), 500

@app.route('/api/auth/refresh', methods=['POST'])
def refresh_token():
    """Refresh access token using refresh token"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        refresh_token = data.get('refresh_token')
        if not refresh_token:
            return jsonify({'error': 'Refresh token is required'}), 400
        
        result = jwt_auth.refresh_token(refresh_token)
        if result:
            return jsonify({
                'success': True,
                'tokens': result
            }), 200
        else:
            return jsonify({
                'error': 'Invalid or expired refresh token',
                'success': False
            }), 401
            
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        return jsonify({'error': 'Token refresh failed'}), 500

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Request password reset - sends reset email"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # Check if user exists
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Generate reset token (in production, send email)
        reset_token = generate_reset_token(user.id)
        
        # For development, return token directly
        # In production, send email with reset link
        return jsonify({
            'message': 'Password reset instructions sent to your email',
            'reset_token': reset_token,  # Remove this in production
        }), 200
        
    except Exception as e:
        logger.error(f"Forgot password error: {e}")
        return jsonify({'error': 'Failed to process request'}), 500

# OAuth Routes
@app.route('/api/auth/google/login')
def google_login():
    """Initiate Google OAuth login"""
    try:
        from oauth import oauth
        redirect_uri = url_for('google_callback', _external=True)
        return oauth.google.authorize_redirect(redirect_uri)
    except Exception as e:
        logger.error(f"Google login error: {e}")
        return jsonify({'error': 'Google login failed'}), 500

@app.route('/api/auth/google/callback')
def google_callback():
    """Handle Google OAuth callback"""
    try:
        print("🔍 Google callback route called")
        print(f"🔍 Request args: {request.args}")
        
        user = handle_google_oauth()
        print(f"🔍 User returned from handle_google_oauth: {user}")
        
        if user:
            print(f"🔍 Logging in user: {user.username}")
            # Update last login
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            # Generate JWT tokens for OAuth user
            tokens = jwt_auth.generate_tokens(user.id)
            print(f"🔍 Generated tokens for OAuth user")
            
            # Redirect to frontend with success and tokens
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
            tokens_param = f"&access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}"
            print(f"🔍 Redirecting to: {frontend_url}?oauth_success=true&provider=google{tokens_param}")
            return redirect(f"{frontend_url}?oauth_success=true&provider=google{tokens_param}")
        else:
            print("❌ No user returned from handle_google_oauth")
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
            return redirect(f"{frontend_url}?oauth_error=true&provider=google")
    except Exception as e:
        print(f"❌ Google callback error: {e}")
        import traceback
        traceback.print_exc()
        logger.error(f"Google callback error: {e}")
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return redirect(f"{frontend_url}?oauth_error=true&provider=google")

@app.route('/api/auth/github/login')
def github_login():
    """Initiate GitHub OAuth login"""
    try:
        # Use GitHub service to generate authorization URL
        auth_url = github_service.get_authorization_url()
        return redirect(auth_url)
    except Exception as e:
        logger.error(f"GitHub login error: {e}")
        return jsonify({'error': 'GitHub login failed'}), 500

@app.route('/api/auth/github/callback')
def github_callback():
    """Handle GitHub OAuth callback for both authentication and integration"""
    try:
        code = request.args.get('code')
        state = request.args.get('state')
        
        if not code:
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
            return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=no_code")
        
        # Check if this is an integration flow (has state with user ID)
        if state and state.startswith('github_auth_'):
            # This is a GitHub integration flow for an existing user
            try:
                user_id = int(state.split('_')[-1])
                
                # Exchange code for access token
                access_token = github_service.exchange_code_for_token(code)
                if not access_token:
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    error_html = f"""
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub Connection Error</title>
                    </head>
                    <body>
                        <script>
                            // Post error message to parent window
                            if (window.opener) {{
                                window.opener.postMessage({{ type: 'github-auth-error', error: 'Token exchange failed' }}, window.location.origin);
                                window.close();
                            }} else {{
                                // If not in popup, redirect to main app
                                window.location.href = '{frontend_url}?github_error=true&error=token_exchange_failed';
                            }}
                        </script>
                        <p>GitHub connection failed. You can close this tab.</p>
                    </body>
                    </html>
                    """
                    return error_html
                
                # Get user info from GitHub
                github_user = github_service.get_user_info(access_token)
                if not github_user:
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    error_html = f"""
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub Connection Error</title>
                    </head>
                    <body>
                        <script>
                            // Post error message to parent window
                            if (window.opener) {{
                                window.opener.postMessage({{ type: 'github-auth-error', error: 'User info failed' }}, window.location.origin);
                                window.close();
                            }} else {{
                                // If not in popup, redirect to main app
                                window.location.href = '{frontend_url}?github_error=true&error=user_info_failed';
                            }}
                        </script>
                        <p>GitHub connection failed. You can close this tab.</p>
                    </body>
                    </html>
                    """
                    return error_html
                
                # Store token for authenticated user
                github_service.store_user_token(user_id, access_token)
                
                # Redirect to frontend with success and post message to parent window
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                success_html = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>GitHub Connected</title>
                </head>
                <body>
                    <script>
                        // Post success message to parent window
                        if (window.opener) {{
                            window.opener.postMessage({{ type: 'github-auth-success' }}, window.location.origin);
                            window.close();
                        }} else {{
                            // If not in popup, redirect to main app
                            window.location.href = '{frontend_url}?github_connected=true';
                        }}
                    </script>
                    <p>GitHub connected successfully! You can close this tab.</p>
                </body>
                </html>
                """
                return success_html
                
            except Exception as e:
                logger.error(f"GitHub integration callback error: {e}")
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                error_html = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>GitHub Connection Error</title>
                </head>
                <body>
                    <script>
                        // Post error message to parent window
                        if (window.opener) {{
                            window.opener.postMessage({{ type: 'github-auth-error', error: 'Integration failed' }}, window.location.origin);
                            window.close();
                        }} else {{
                            // If not in popup, redirect to main app
                            window.location.href = '{frontend_url}?github_error=true&error=integration_failed';
                        }}
                    </script>
                    <p>GitHub connection failed. You can close this tab.</p>
                </body>
                </html>
                """
                return error_html
        else:
            # This is a regular GitHub OAuth login flow
            try:
                # Exchange code for access token using GitHub service
                access_token = github_service.exchange_code_for_token(code)
                if not access_token:
                    logger.error("Failed to exchange code for token in login flow")
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=token_exchange_failed")
                
                # Get user info from GitHub
                github_user = github_service.get_user_info(access_token)
                if not github_user:
                    logger.error("Failed to get user info in login flow")
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=user_info_failed")
                
                # Get user emails from GitHub (required for users with private email settings)
                import requests
                emails_response = requests.get(
                    'https://api.github.com/user/emails',
                    headers={'Authorization': f'token {access_token}'}
                )
                
                primary_email = None
                if emails_response.status_code == 200:
                    emails = emails_response.json()
                    # Find primary email
                    for email_info in emails:
                        if email_info.get('primary') and email_info.get('verified'):
                            primary_email = email_info['email']
                            break
                
                # Fallback to user's email if available
                if not primary_email:
                    primary_email = github_user.get('email')
                
                if not primary_email:
                    logger.error("No verified email found in GitHub user data or emails")
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=no_email")
                
                # Create or find user using the GitHub user data
                from oauth import get_or_create_oauth_user
                
                provider_user_id = str(github_user['id'])
                email = primary_email
                
                profile_data = {
                    'login': github_user.get('login'),
                    'name': github_user.get('name'),
                    'avatar_url': github_user.get('avatar_url'),
                    'bio': github_user.get('bio'),
                    'location': github_user.get('location'),
                    'company': github_user.get('company'),
                    'blog': github_user.get('blog'),
                    'public_repos': github_user.get('public_repos'),
                    'followers': github_user.get('followers'),
                    'following': github_user.get('following')
                }
                
                user = get_or_create_oauth_user('github', provider_user_id, email, profile_data)
                
                if user:
                    # Save the GitHub access token
                    user.github_token = access_token
                    # Update last login
                    user.last_login = datetime.utcnow()
                    db.session.commit()
                    
                    # Generate JWT tokens for OAuth user
                    tokens = jwt_auth.generate_tokens(user.id)
                    
                    # Redirect to frontend with success and tokens
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    tokens_param = f"&access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}"
                    return redirect(f"{frontend_url}?oauth_success=true&provider=github{tokens_param}")
                else:
                    logger.error("Failed to create or find user in login flow")
                    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                    return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=user_creation_failed")
                    
            except Exception as e:
                logger.error(f"GitHub login flow error: {e}")
                frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
                return redirect(f"{frontend_url}?oauth_error=true&provider=github&error=login_flow_failed")
                
    except Exception as e:
        logger.error(f"GitHub callback error: {e}")
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        return redirect(f"{frontend_url}?oauth_error=true&provider=github")

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password using token"""
    try:
        data = request.get_json()
        reset_token = data.get('reset_token', '').strip()
        new_password = data.get('new_password', '')
        
        if not all([reset_token, new_password]):
            return jsonify({'error': 'Reset token and new password are required'}), 400
        
        # Verify reset token
        user_id = verify_reset_token(reset_token)
        if not user_id:
            return jsonify({'error': 'Invalid or expired reset token'}), 400
        
        # Update password
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        return jsonify({
            'message': 'Password reset successfully',
            'success': True
        }), 200
        
    except Exception as e:
        logger.error(f"Reset password error: {e}")
        return jsonify({'error': 'Failed to reset password'}), 500

@app.route('/api/auth/change-password', methods=['POST'])
@jwt_required
def change_password():
    """Change password for logged-in user"""
    try:
        current_user = get_current_user()
        data = request.get_json()
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not all([current_password, new_password]):
            return jsonify({'error': 'Current and new password are required'}), 400
        
        # Verify current password
        if not check_password_hash(current_user.password_hash, current_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        # Update password
        current_user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        return jsonify({
            'message': 'Password changed successfully',
            'success': True
        }), 200
        
    except Exception as e:
        logger.error(f"Change password error: {e}")
        return jsonify({'error': 'Failed to change password'}), 500

# # Chat session routes
@app.route('/api/sessions', methods=['GET'])
@jwt_required
def get_sessions():
    """Get user's chat sessions"""
    try:
        current_user = get_current_user()
        print(f"🔍 GET /api/sessions - current_user.id: {current_user.id}")
        print(f"🔍 GET /api/sessions - current_user.username: {current_user.username}")
        sessions = get_user_chat_sessions(current_user.id)
        print(f"🔍 GET /api/sessions - returned {len(sessions)} sessions")
        return jsonify({
            'sessions': sessions,
            'success': True
        }), 200
    except Exception as e:
        logger.error(f"Get sessions error: {e}")
        return jsonify({'error': 'Failed to get sessions'}), 500

@app.route('/api/sessions', methods=['POST'])
@jwt_required
def create_session():
    """Create a new chat session"""
    try:
        data = request.get_json() or {}
        model = data.get('model', 'qwen2.5:8b')
        
        current_user = get_current_user()
        print(f"🔍 POST /api/sessions - current_user.id: {current_user.id}")
        print(f"🔍 POST /api/sessions - current_user.username: {current_user.username}")
        
        session_id = create_chat_session(current_user.id, model)
        
        if session_id:
            print(f"🔍 POST /api/sessions - created session {session_id}")
            return jsonify({
                'session_id': session_id,
                'message': 'Session created successfully',
                'success': True
            }), 201
        else:
            return jsonify({'error': 'Failed to create session'}), 500
            
    except Exception as e:
        logger.error(f"Create session error: {e}")
        return jsonify({'error': 'Failed to create session'}), 500

@app.route('/api/sessions/<int:session_id>/messages', methods=['GET'])
@jwt_required
def get_session_messages(session_id):
    """Get messages for a specific session"""
    try:
        current_user = get_current_user()
        # Verify session belongs to user
        session_obj = ChatSession.query.filter_by(
            id=session_id, 
            user_id=current_user.id,
            is_active=True
        ).first()
        
        if not session_obj:
            return jsonify({'error': 'Session not found'}), 404
        
        messages = get_chat_messages(session_id)
        return jsonify({
            'messages': messages,
            'session': {
                'id': session_obj.id,
                'title': session_obj.title,
                'model_used': session_obj.model_used
            },
            'success': True
        }), 200
        
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return jsonify({'error': 'Failed to get messages'}), 500

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
@jwt_required
def delete_session(session_id):
    """Delete a chat session"""
    try:
        current_user = get_current_user()
        success = delete_chat_session(session_id, current_user.id)
        
        if success:
            return jsonify({
                'message': 'Session deleted successfully',
                'success': True
            }), 200
        else:
            return jsonify({'error': 'Session not found or already deleted'}), 404
            
    except Exception as e:
        logger.error(f"Delete session error: {e}")
        return jsonify({'error': 'Failed to delete session'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    ollama_status = check_ollama_connection()
    return jsonify({
        'status': 'healthy',
        'ollama_connected': ollama_status,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/models', methods=['GET'])
def get_models():
    """Get available models"""
    try:
        # Get models that are actually installed in Ollama
        installed_models = get_available_models()
        
        # Filter available models to only show installed ones
        available_models = []
        for model in AVAILABLE_MODELS:
            if model['id'] in installed_models:
                available_models.append(model)
        
        return jsonify({
            'models': available_models,
            'installed_models': installed_models,
            'total': len(available_models)
        })
    except Exception as e:
        logger.error(f"Error getting models: {e}")
        return jsonify({'error': 'Failed to get models'}), 500
# #4
@app.route('/api/system-prompt/debug', methods=['GET'])
def system_prompt_debug():
    """Debug endpoint to check file paths and existence"""
    try:
        debug_info = {
            'current_working_directory': os.getcwd(),
            'script_directory': os.path.dirname(__file__),
            'attempted_paths': [],
            'file_exists': {},
            'file_contents_preview': {}
        }
        
        possible_paths = [
            os.path.join(os.path.dirname(__file__), 'system_prompts', 'code_generation_prompt.txt'),
            os.path.join(os.getcwd(), 'backend', 'system_prompts', 'code_generation_prompt.txt'),
            os.path.join(os.getcwd(), 'system_prompts', 'code_generation_prompt.txt'),
            'backend/system_prompts/code_generation_prompt.txt',
            'system_prompts/code_generation_prompt.txt'
        ]
        
        for path in possible_paths:
            debug_info['attempted_paths'].append(path)
            debug_info['file_exists'][path] = os.path.exists(path)
            
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        debug_info['file_contents_preview'][path] = content[:200] + ('...' if len(content) > 200 else '')
                except Exception as e:
                    debug_info['file_contents_preview'][path] = f"Error reading file: {e}"
        
        return jsonify(debug_info)
    except Exception as e:
        return jsonify({'error': f'Debug failed: {e}'}), 500

@app.route('/api/context-debug/<int:session_id>', methods=['GET'])
def context_debug(session_id):
    """Debug endpoint to check conversation context"""
    try:
        # Get messages from database
        db_messages = get_chat_messages(session_id)
        
        debug_info = {
            'session_id': session_id,
            'total_messages': len(db_messages),
            'messages': db_messages,
            'recent_20': db_messages[-20:] if len(db_messages) > 20 else db_messages,
            'context_summary': {
                'user_messages': len([msg for msg in db_messages if msg['role'] == 'user']),
                'assistant_messages': len([msg for msg in db_messages if msg['role'] == 'assistant']),
                'total_chars': sum(len(msg['content']) for msg in db_messages)
            }
        }
        
        return jsonify(debug_info)
    except Exception as e:
        logger.error(f"Context debug error: {e}")
        return jsonify({'error': f'Debug failed: {e}'}), 500

@app.route('/api/token-config', methods=['GET', 'POST'])
def token_config():
    """Get or update token configuration"""
    global DEFAULT_TOKEN_LIMITS
    
    if request.method == 'GET':
        try:
            return jsonify({
                'config': DEFAULT_TOKEN_LIMITS,
                'success': True
            })
        except Exception as e:
            logger.error(f"Error getting token config: {e}")
            return jsonify({'error': 'Failed to get token config'}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Configuration data is required'}), 400
            
            # Update configuration with provided values
            if 'num_predict' in data:
                num_predict = int(data['num_predict'])
                if num_predict <= 0:
                    # Remove num_predict for unlimited tokens
                    DEFAULT_TOKEN_LIMITS.pop('num_predict', None)
                else:
                    # Set specific token limit (max 16384 for safety)
                    DEFAULT_TOKEN_LIMITS['num_predict'] = max(256, min(16384, num_predict))
            if 'temperature' in data:
                DEFAULT_TOKEN_LIMITS['temperature'] = max(0.1, min(2.0, float(data['temperature'])))
            if 'top_p' in data:
                DEFAULT_TOKEN_LIMITS['top_p'] = max(0.1, min(1.0, float(data['top_p'])))
            if 'repeat_penalty' in data:
                DEFAULT_TOKEN_LIMITS['repeat_penalty'] = max(0.5, min(2.0, float(data['repeat_penalty'])))
            if 'top_k' in data:
                DEFAULT_TOKEN_LIMITS['top_k'] = max(1, min(100, int(data['top_k'])))
            if 'stop' in data and isinstance(data['stop'], list):
                DEFAULT_TOKEN_LIMITS['stop'] = data['stop'][:10]  # Limit to 10 stop sequences
            
            logger.info(f"Token configuration updated: {DEFAULT_TOKEN_LIMITS}")
            
            return jsonify({
                'message': 'Token configuration updated successfully',
                'config': DEFAULT_TOKEN_LIMITS,
                'success': True
            })
        except Exception as e:
            logger.error(f"Error updating token config: {e}")
            return jsonify({'error': 'Failed to update token config'}), 500

@app.route('/api/system-prompt', methods=['GET', 'POST'])
def system_prompt_config():
    """Get or update the system prompt"""
    if request.method == 'GET':
        try:
            current_prompt = load_system_prompt()
            return jsonify({
                'prompt': current_prompt,
                'success': True
            })
        except Exception as e:
            logger.error(f"Error getting system prompt: {e}")
            return jsonify({'error': 'Failed to get system prompt'}), 500
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            if not data or 'prompt' not in data:
                return jsonify({'error': 'Prompt content is required'}), 400
            
            new_prompt = data['prompt'].strip()
            if not new_prompt:
                return jsonify({'error': 'Prompt cannot be empty'}), 400
            
            # Save the new prompt to file
            # First try to find existing file location, then use default
            prompt_file = None
            possible_paths = [
                os.path.join(os.path.dirname(__file__), 'system_prompts', 'code_generation_prompt.txt'),
                os.path.join(os.getcwd(), 'backend', 'system_prompts', 'code_generation_prompt.txt'),
                os.path.join(os.getcwd(), 'system_prompts', 'code_generation_prompt.txt'),
                'backend/system_prompts/code_generation_prompt.txt',
                'system_prompts/code_generation_prompt.txt'
            ]
            
            # Try to find existing file first
            for path in possible_paths:
                if os.path.exists(path):
                    prompt_file = path
                    break
            
            # If no existing file found, use the first path and create directories
            if not prompt_file:
                prompt_file = possible_paths[0]
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(prompt_file), exist_ok=True)
            
            # Write the new prompt
            with open(prompt_file, 'w', encoding='utf-8') as f:
                f.write(new_prompt)
            
            logger.info(f"System prompt saved to: {prompt_file}")
            
            return jsonify({
                'message': 'System prompt updated successfully',
                'success': True
            })
        except Exception as e:
            logger.error(f"Error updating system prompt: {e}")
            return jsonify({'error': 'Failed to update system prompt'}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """Handle chat requests via HTTP"""
    try:
        # Validate request content type
        if not request.is_json:
            return jsonify({
                'error': 'Content-Type must be application/json'
            }), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        message = data.get('message', '').strip()
        model = data.get('model', 'qwen2.5:8b')
        conversation_history = data.get('history', [])
        #1
        system_prompt = data.get('system_prompt', load_system_prompt())
        
        # Validate required fields
        if not message:
            return jsonify({'error': 'Message is required and cannot be empty'}), 400
        
        # Check Ollama connection
        if not check_ollama_connection():
            return jsonify({
                'error': 'Ollama service is not available. Please ensure Ollama is running.'
            }), 503
        
        # Prepare conversation context
        messages = [{'role': 'system', 'content': system_prompt}]
        
        # Add conversation history
        if conversation_history:
            # Limit history to last 20 messages to provide more context while preventing overflow
            recent_history = conversation_history[-20:]
            messages.extend(recent_history)
            logger.info(f"HTTP API: Added {len(recent_history)} messages to context")
        
        # Add current message
        messages.append({'role': 'user', 'content': message})
        
        # Generate response using Ollama
        response = ollama.chat(
            model=model,
            messages=messages,
            stream=False
        )
        
        return jsonify({
            'response': response['message']['content'],
            'model': model,
            'timestamp': datetime.now().isoformat(),
            'success': True
        })
        
    except ollama.ResponseError as e:
        logger.error(f"Ollama response error: {e}")
        return jsonify({
            'error': f'Ollama error: {str(e)}',
            'type': 'ollama_error'
        }), 500
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return jsonify({
            'error': 'Internal server error',
            'type': 'server_error'
        }), 500

@app.route('/api/stop-generation', methods=['POST'])
@jwt_required
def stop_generation_api():
    """Stop ongoing response generation via REST API"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        current_user = get_current_user()
        user_id = current_user.id if current_user else None
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
        
        # Stop the streaming
        if stop_streaming(session_id, user_id):
            return jsonify({
                'success': True,
                'session_id': session_id,
                'message': 'Response generation stopped successfully',
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': 'No active generation found for this session'}), 404
            
    except Exception as e:
        logger.error(f"Error stopping generation: {e}")
        return jsonify({'error': 'Failed to stop generation'}), 500

@app.route('/api/new-chat', methods=['POST'])
@jwt_required
def new_chat_api():
    """Start a new chat session via REST API"""
    try:
        data = request.get_json()
        current_user = get_current_user()
        user_id = current_user.id if current_user else None
        model = data.get('model', 'qwen2.5:8b')
        current_session_id = data.get('session_id')
        
        # Stop any ongoing generation first
        if current_session_id:
            stop_streaming(current_session_id, user_id)
        
        # Create new chat session
        session_result = create_new_chat_session(user_id)
        
        if session_result['success']:
            # Update session model if user is authenticated
            if user_id and session_result['session_id']:
                try:
                    session_obj = ChatSession.query.get(session_result['session_id'])
                    if session_obj:
                        session_obj.model_used = model
                        db.session.commit()
                except Exception as e:
                    logger.error(f"Error updating session model: {e}")
            
            return jsonify({
                'success': True,
                'session_id': session_result['session_id'],
                'model': model,
                'message': session_result['message'],
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': session_result['message']}), 500
            
    except Exception as e:
        logger.error(f"Error creating new chat: {e}")
        return jsonify({'error': 'Failed to create new chat session'}), 500

# # Test route
@app.route('/api/test', methods=['GET'])
def test_route():
    return jsonify({'message': 'Test route working'})



# # Test upload endpoint without authentication (for debugging)
@app.route('/api/test-upload-simple', methods=['POST'])
def test_upload_simple():
    """Simple upload test without authentication"""
    try:
        logger.info("Simple upload test called")
        logger.info(f"Request files: {list(request.files.keys())}")
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Read file content
        content = file.read().decode('utf-8', errors='ignore')
        
        return jsonify({
            'success': True,
            'filename': file.filename,
            'content': content[:200] + "..." if len(content) > 200 else content,
            'size': len(content)
        })
        
    except Exception as e:
        logger.error(f"Simple upload test error: {e}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

# # # File upload endpoint
# # @app.route('/api/upload', methods=['POST'])
# # # @login_required
# # def upload_file():
# #     """Handle file uploads"""
# #     try:
# #         # Check if user is authenticated, otherwise use anonymous
# #         user_info = "authenticated user" if hasattr(current_user, 'username') and current_user.is_authenticated else "anonymous user"
# #         logger.info(f"File upload request received from: {user_info}")
# #         logger.info(f"Request files: {list(request.files.keys())}")
# #         logger.info(f"Request headers: {dict(request.headers)}")
        
# #         if 'file' not in request.files:
# #             logger.error("No file in request.files")
# #             return jsonify({'error': 'No file provided'}), 400
        
# #         file = request.files['file']
# #         if file.filename == '':
# #             logger.error("Empty filename")
# #             return jsonify({'error': 'No file selected'}), 400
        
# #         logger.info(f"Processing file: {file.filename}, size: {file.content_length if hasattr(file, 'content_length') else 'unknown'}")
        
# #         # Read file content
# #         content = file.read().decode('utf-8', errors='ignore')
        
# #         # Generate file ID
# #         file_id = f"file_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        
# #         logger.info(f"File uploaded successfully: {file_id}, content length: {len(content)}")
        
# #         return jsonify({
# #             'success': True,
# #             'fileId': file_id,
# #             'content': content,
# #             'filename': file.filename,
# #             'size': len(content)
# #         })
        
# #     except Exception as e:
# #         logger.error(f"File upload error: {e}")
# #         return jsonify({'error': f'Failed to upload file: {str(e)}'}), 500




@app.route('/api/upload', methods=['POST', 'OPTIONS'])
@login_required
def upload_file():
    """Handle file uploads with CORS support"""
    # Handle preflight requests
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        # Debug information
        logger.info("=== FILE UPLOAD DEBUG ===")
        logger.info(f"Method: {request.method}")
        logger.info(f"Content-Type: {request.content_type}")
        logger.info(f"Content-Length: {request.content_length}")
        logger.info(f"Files keys: {list(request.files.keys())}")
        logger.info(f"Form keys: {list(request.form.keys())}")
        logger.info(f"Headers: {dict(request.headers)}") 
        
        # Check if request has files
        if not request.files:
            logger.error("No files in request")
            return jsonify({'error': 'No files in request', 'debug': 'request.files is empty'}), 400
        
        # Check if 'file' key exists
        if 'file' not in request.files:
            available_keys = list(request.files.keys())
            logger.error(f"'file' key not found. Available keys: {available_keys}")
            return jsonify({
                'error': 'No file provided', 
                'debug': f'Expected key "file", got keys: {available_keys}',
                'hint': 'Make sure the form field name is "file"'
            }), 400
        
        file = request.files['file']
        
        # Check if file is selected
        if file.filename == '':
            logger.error("Empty filename")
            return jsonify({'error': 'No file selected', 'debug': 'filename is empty'}), 400
        
        logger.info(f"Processing file: {file.filename}")
        logger.info(f"File mimetype: {file.mimetype}")
        
        # Read file content
        file_content = file.read()
        
        # Try to decode as text
        try:
            if file.mimetype and file.mimetype.startswith('text/'):
                content = file_content.decode('utf-8')
            else:
                # For binary files, try utf-8 with error handling
                content = file_content.decode('utf-8', errors='ignore')
        except Exception as decode_error:
            logger.error(f"Failed to decode file: {decode_error}")
            return jsonify({'error': 'Failed to decode file content'}), 400
        
        # Generate file ID
        file_id = f"file_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        
        logger.info(f"File uploaded successfully: {file_id}, content length: {len(content)}")
        
        response_data = {
            'success': True,
            'fileId': file_id,
            'content': content,
            'filename': file.filename,
            'size': len(content),
            'mimetype': file.mimetype
        }
        
        response = jsonify(response_data)
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
        
    except Exception as e:
        logger.error(f"File upload error: {e}", exc_info=True)
        error_response = jsonify({
            'error': f'Failed to upload file: {str(e)}',
            'debug': 'Check server logs for details'
        })
        error_response.headers.add('Access-Control-Allow-Origin', '*')
        return error_response, 500


# GitHub integration endpoints
from github_service import github_service

@app.route('/api/github/auth', methods=['GET'])
@jwt_required
def github_auth():
    """Initialize GitHub OAuth authentication"""
    try:
        current_user = get_current_user()
        state = f"github_auth_{current_user.id}"
        auth_url = github_service.get_authorization_url(state)
        
        return jsonify({
            'auth_url': auth_url,
            'state': state,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub auth error: {e}")
        return jsonify({'error': 'Failed to initialize GitHub authentication'}), 500


@app.route('/api/github/status', methods=['GET'])
@jwt_required
def github_status():
    """Check GitHub connection status"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if token:
            # Verify token is still valid
            user_info = github_service.get_user_info(token)
            if user_info:
                return jsonify({
                    'connected': True,
                    'user': user_info,
                    'success': True
                })
        
        return jsonify({
            'connected': False,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub status error: {e}")
        return jsonify({'error': 'Failed to check GitHub status'}), 500

@app.route('/api/github/repos', methods=['GET'])
@jwt_required
def get_github_repos():
    """Get user's GitHub repositories"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if not token:
            return jsonify({'error': 'GitHub not connected'}), 401
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 30, type=int)
        search = request.args.get('search', '')
        
        if search:
            repos = github_service.search_repositories(token, search, page, per_page)
        else:
            repos = github_service.get_user_repositories(token, page, per_page)
        
        return jsonify({
            'repositories': repos,
            'page': page,
            'per_page': per_page,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub repos error: {e}")
        return jsonify({'error': 'Failed to fetch repositories'}), 500

@app.route('/api/github/repos/<path:repo_full_name>/contents', methods=['GET'])
@jwt_required
def get_github_repo_contents(repo_full_name):
    """Get repository contents"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if not token:
            return jsonify({'error': 'GitHub not connected'}), 401
        
        path = request.args.get('path', '')
        contents = github_service.get_repository_contents(token, repo_full_name, path)
        
        return jsonify({
            'contents': contents,
            'repository': repo_full_name,
            'path': path,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub repo contents error: {e}")
        return jsonify({'error': 'Failed to fetch repository contents'}), 500

@app.route('/api/github/repos/<path:repo_full_name>/files/<path:file_path>', methods=['GET'])
@jwt_required
def get_github_file_content(repo_full_name, file_path):
    """Get file content from repository"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if not token:
            return jsonify({'error': 'GitHub not connected'}), 401
        
        file_content = github_service.get_file_content(token, repo_full_name, file_path)
        
        if not file_content:
            return jsonify({'error': 'File not found or is not a file'}), 404
        
        return jsonify({
            'file': file_content,
            'repository': repo_full_name,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub file content error: {e}")
        return jsonify({'error': 'Failed to fetch file content'}), 500

@app.route('/api/github/repos/<path:repo_full_name>/tree', methods=['GET'])
@jwt_required
def get_github_repo_tree(repo_full_name):
    """Get repository file tree"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if not token:
            return jsonify({'error': 'GitHub not connected'}), 401
        
        max_depth = request.args.get('max_depth', 3, type=int)
        tree = github_service.get_repository_tree(token, repo_full_name, max_depth)
        
        return jsonify({
            'tree': tree,
            'repository': repo_full_name,
            'success': True
        })
    except Exception as e:
        logger.error(f"GitHub repo tree error: {e}")
        return jsonify({'error': 'Failed to fetch repository tree'}), 500

@app.route('/api/github/import', methods=['POST'])
@jwt_required
def import_github_content():
    """Import content from GitHub repository or file"""
    try:
        current_user = get_current_user()
        token = github_service.get_user_token(current_user.id)
        
        if not token:
            return jsonify({'error': 'GitHub not connected'}), 401
        
        data = request.get_json()
        repo_full_name = data.get('repository')
        file_path = data.get('file_path')
        import_type = data.get('type', 'file')  # 'file' or 'repository'
        
        if not repo_full_name:
            return jsonify({'error': 'Repository name is required'}), 400
        
        if import_type == 'file' and file_path:
            # Import specific file
            file_content = github_service.get_file_content(token, repo_full_name, file_path)
            if not file_content:
                return jsonify({'error': 'File not found'}), 404
            
            return jsonify({
                'success': True,
                'type': 'file',
                'content': file_content['content'],
                'filename': file_content['name'],
                'repository': repo_full_name,
                'file_path': file_path
            })
        else:
            # Import repository structure
            tree = github_service.get_repository_tree(token, repo_full_name, 2)
            if not tree:
                return jsonify({'error': 'Repository not found'}), 404
            
            return jsonify({
                'success': True,
                'type': 'repository',
                'tree': tree,
                'repository': repo_full_name
            })
            
    except Exception as e:
        logger.error(f"GitHub import error: {e}")
        return jsonify({'error': 'Failed to import from GitHub'}), 500

@app.route('/api/github/disconnect', methods=['POST'])
@jwt_required
def disconnect_github():
    """Disconnect GitHub integration"""
    try:
        current_user = get_current_user()
        user = User.query.get(current_user.id)
        
        if user:
            user.github_token = None
            db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'GitHub disconnected successfully'
        })
    except Exception as e:
        logger.error(f"GitHub disconnect error: {e}")
        return jsonify({'error': 'Failed to disconnect GitHub'}), 500

# Google Drive integration endpoints
@app.route('/api/googledrive/files', methods=['GET'])
@login_required
def get_google_drive_files():
    """Get user's Google Drive files"""
    try:
        # In a real implementation, this would use Google Drive API
        # For now, return mock data
        files = [
            {
                'id': '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
                'name': 'Example Document',
                'mimeType': 'application/vnd.google-apps.document',
                'webViewLink': 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'
            }
        ]
        return jsonify(files)
    except Exception as e:
        logger.error(f"Google Drive files error: {e}")
        return jsonify({'error': 'Failed to fetch files'}), 500

@app.route('/api/googledrive/import', methods=['POST'])
@login_required
def import_google_drive_file():
    """Import content from Google Drive file"""
    try:
        data = request.get_json()
        file_id = data.get('fileId')
        
        # In a real implementation, this would fetch from Google Drive API
        # For now, return mock content
        content = f"# Content from Google Drive file {file_id}\n\nThis is mock content from the Google Drive file."
        
        return jsonify({
            'success': True,
            'content': content,
            'fileId': file_id
        })
    except Exception as e:
        logger.error(f"Google Drive import error: {e}")
        return jsonify({'error': 'Failed to import file'}), 500

# Search endpoint
@app.route('/api/search', methods=['POST'])
@login_required
def search_content():
    """Search through content"""
    try:
        data = request.get_json()
        query = data.get('query', '')
        
        # In a real implementation, this would search through indexed content
        # For now, return mock results
        results = [
            {
                'title': 'Search Result 1',
                'content': f'Content matching query: {query}',
                'url': '#'
            }
        ]
        
        return jsonify({
            'success': True,
            'results': results,
            'query': query
        })
    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({'error': 'Failed to search content'}), 500

# Projects endpoints
@app.route('/api/projects', methods=['GET'])
@login_required
def get_projects():
    """Get user's projects"""
    try:
        # In a real implementation, this would fetch from database
        # For now, return mock data
        projects = [
            {
                'id': '1',
                'name': 'Example Project',
                'description': 'An example project',
                'created_at': datetime.now().isoformat()
            }
        ]
        return jsonify(projects)
    except Exception as e:
        logger.error(f"Projects error: {e}")
        return jsonify({'error': 'Failed to fetch projects'}), 500

@app.route('/api/projects/select', methods=['POST'])
@login_required
def select_project():
    """Select a project"""
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        
        # In a real implementation, this would load project content
        # For now, return mock content
        content = f"# Project {project_id}\n\nThis is mock content from the selected project."
        
        return jsonify({
            'success': True,
            'content': content,
            'projectId': project_id
        })
    except Exception as e:
        logger.error(f"Project selection error: {e}")
        return jsonify({'error': 'Failed to select project'}), 500

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info(f"Client connected: {request.sid}")
    emit('connected', {
        'message': 'Connected to chatbot server',
        'status': 'success',
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {request.sid}")
    
    # Clean up any active streaming sessions for this client
    # This is a simple cleanup - in a production environment, you might want to
    # track which sessions belong to which socket connections
    try:
        # For now, we'll clean up all active streams
        # In a more sophisticated implementation, you'd track socket-to-session mapping
        streams_to_cleanup = list(active_streams.keys())
        for stream_key in streams_to_cleanup:
            if stream_key in active_streams:
                del active_streams[stream_key]
            if stream_key in stream_locks:
                del stream_locks[stream_key]
        logger.info(f"Cleaned up {len(streams_to_cleanup)} active streams on disconnect")
    except Exception as e:
        logger.error(f"Error cleaning up streams on disconnect: {e}")

def post_process_web_development_response(response, model):
    """
    Post-process the response to ensure proper format for web development.
    This function detects React projects and saves them, or converts multi-file responses to single HTML files.
    """
    try:
        # Check if this is a React project
        if _is_react_project_content(response):
            logger.info(f"Detected React project from {model}, saving to projects folder...")
            try:
                # Save React project automatically
                result = project_saver.save_react_project(response)
                if result['success']:
                    logger.info(f"Successfully saved React project: {result['project_name']}")
                    # Add project info to response
                    project_info = f"\n\n🚀 **React Project Saved!**\nProject Name: `{result['project_name']}`\nLocation: `{result['project_path']}`\nFiles Created: {', '.join(result['files'])}\n\nTo run the project:\n```bash\ncd {result['project_name']}\nnpm install\nnpm run dev\n```\n\n"
                    return response + project_info
                else:
                    logger.error(f"Failed to save React project: {result['error']}")
            except Exception as e:
                logger.error(f"Error saving React project: {e}")
            return response
        
        # Check if this is a web development response (contains HTML, CSS, or JS)
        if not any(keyword in response.lower() for keyword in ['html', 'css', 'javascript', 'js', 'web', 'landing page', 'website']):
            return response
        
        # Check if the response contains multiple file references
        has_external_css = '<link rel="stylesheet"' in response or 'href="styles.css"' in response
        has_external_js = '<script src=' in response or 'src="script.js"' in response
        has_multiple_files = '```html' in response and ('```css' in response or '```js' in response)
        
        if not (has_external_css or has_external_js or has_multiple_files):
            return response
        
        logger.info(f"Detected multi-file response from {model}, converting to single file...")
        
        # Extract HTML content
        html_match = re.search(r'```html\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
        if not html_match:
            # Try to find HTML without code blocks
            html_match = re.search(r'<!DOCTYPE html>(.*?)</html>', response, re.DOTALL | re.IGNORECASE)
            if html_match:
                html_content = f"<!DOCTYPE html>{html_match.group(1)}</html>"
            else:
                return response
        else:
            html_content = html_match.group(1)
        
        # Extract CSS content
        css_content = ""
        css_match = re.search(r'```css\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
        if css_match:
            css_content = css_match.group(1)
        
        # Extract JavaScript content
        js_content = ""
        js_match = re.search(r'```javascript\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
        if not js_match:
            js_match = re.search(r'```js\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
        if js_match:
            js_content = js_match.group(1)
        
        # Create single HTML file
        single_html = create_single_html_file(html_content, css_content, js_content)
        
        # Replace the response with the single HTML file
        if single_html:
            # Find the explanation part (before the code blocks)
            explanation_match = re.search(r'^(.*?)(```html|<!DOCTYPE html)', response, re.DOTALL | re.IGNORECASE)
            if explanation_match:
                explanation = explanation_match.group(1).strip()
                new_response = f"{explanation}\n\n{single_html}"
            else:
                new_response = single_html
            
            logger.info(f"Successfully converted multi-file response to single HTML file")
            return new_response
        
        return response
        
    except Exception as e:
        logger.error(f"Error in post-processing web development response: {e}")
        return response

def create_single_html_file(html_content, css_content, js_content):
    """
    Create a single HTML file with embedded CSS and JavaScript.
    """
    try:
        # Parse the HTML content
        if not html_content.strip():
            return None
        
        # Remove any existing style and script tags
        html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
        
        # Remove external CSS and JS links
        html_content = re.sub(r'<link[^>]*rel=["\']stylesheet["\'][^>]*>', '', html_content, flags=re.IGNORECASE)
        html_content = re.sub(r'<script[^>]*src=["\'][^"\']*\.(css|js)["\'][^>]*></script>', '', html_content, flags=re.IGNORECASE)
        
        # Find the head and body sections
        head_match = re.search(r'<head[^>]*>(.*?)</head>', html_content, re.DOTALL | re.IGNORECASE)
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html_content, re.DOTALL | re.IGNORECASE)
        
        if not head_match or not body_match:
            return None
        
        head_content = head_match.group(1)
        body_content = body_match.group(1)
        
        # Create new HTML with embedded CSS and JS
        new_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Web Page</title>
    {head_content}
    <style>
        /* Embedded CSS */
        {css_content}
    </style>
</head>
<body>
    {body_content}
    
    <script>
        // Embedded JavaScript
        {js_content}
    </script>
</body>
</html>"""
        
        return new_html
        
    except Exception as e:
        logger.error(f"Error creating single HTML file: {e}")
        return None

@socketio.on('chat_message')
def handle_chat_message(data):
    """Handle real-time chat messages with streaming"""
    try:
        message = data.get('message', '').strip()
        model = data.get('model', 'qwen2.5:8b')
        session_id = data.get('session_id')
        frontend_history = data.get('history', [])  
        system_prompt = data.get('system_prompt', load_system_prompt())
        
        # Get user ID if authenticated
        user_id = current_user.id if hasattr(current_user, 'id') else None
        
        if not message:
            emit('error', {'error': 'Message is required and cannot be empty'})
            return
        
        # Check Ollama connection
        if not check_ollama_connection():
            emit('error', {'error': 'Ollama service is not available'})
            return
        
        # Create new session if none exists and user is authenticated
        if not session_id and user_id:
            session_id = create_chat_session(user_id, model)
            if session_id:
                logger.info(f"Created new session {session_id} for user {user_id}")
                # Emit session created event to frontend
                emit('session_created', {
                    'session_id': session_id,
                    'model': model
                })
            else:
                emit('error', {'error': 'Failed to create chat session'})
                return
        
        # Initialize streaming session tracking
        stream_key = get_stream_key(session_id, user_id)
        active_streams[stream_key] = True
        
        # Get conversation history - prioritize frontend history, fallback to database
        conversation_history = []
        
        if frontend_history:
            # Use history from frontend (most up-to-date)
            conversation_history = frontend_history
            logger.info(f"Using frontend history: {len(conversation_history)} messages")
        elif session_id:
            # Fallback to database history if no frontend history
            try:
                # Verify session belongs to user (if authenticated)
                if user_id:
                    session_obj = ChatSession.query.filter_by(
                        id=session_id, 
                        user_id=user_id,
                        is_active=True
                    ).first()
                    if not session_obj:
                        emit('error', {'error': 'Session not found'})
                        cleanup_stream_session(session_id, user_id)
                        return
                
                # Get messages from database
                db_messages = get_chat_messages(session_id)
                conversation_history = [
                    {'role': msg['role'], 'content': msg['content']} 
                    for msg in db_messages
                ]
                logger.info(f"Using database history: {len(conversation_history)} messages")
            except Exception as e:
                logger.error(f"Error getting conversation history: {e}")
        
        # Prepare conversation context
        messages = [{'role': 'system', 'content': system_prompt}]
        
        # Add conversation history (limit to last 20 messages for better context)
        if conversation_history:
            recent_history = conversation_history[-20:]
            messages.extend(recent_history)
            logger.info(f"Added {len(recent_history)} messages to context")
        
        # Check if this is a React project request and use focused prompt
        if _is_react_project_request(message):
            try:
                with open('system_prompts/react_project_prompt.txt', 'r', encoding='utf-8') as f:
                    system_prompt = f.read()
                logger.info("Using focused React project prompt")
            except Exception as e:
                logger.error(f"Failed to load React project prompt: {e}")
        
        # Add current message
        messages.append({'role': 'user', 'content': message})
        
        # Debug: Log the final context being sent to the model
        logger.info(f"Final context for model: {len(messages)} messages")
        for i, msg in enumerate(messages):
            logger.info(f"Message {i}: {msg['role']} - {msg['content'][:100]}...")
        
        # Save user message to database if session_id provided
        if session_id:
            save_chat_message(session_id, 'user', message, model)
        
        # Stream response using Ollama
        full_response = ""
        previous_length = 0  # Track previous response length to avoid duplication
        
        try:
            for chunk in ollama.chat(
                model=model,
                messages=messages,
                stream=True,
                options=DEFAULT_TOKEN_LIMITS
            ):
                # Check if streaming has been stopped
                if is_streaming_stopped(session_id, user_id):
                    logger.info(f"Streaming stopped for session {session_id}")
                    emit('chat_response_stopped', {
                        'session_id': session_id,
                        'message': 'Response generation stopped by user',
                        'timestamp': datetime.now().isoformat()
                    })
                    break
                
                if 'message' in chunk and 'content' in chunk['message']:
                    content = chunk['message']['content']
                    if content:
                        full_response += content
                        
                        # Only emit new content (avoid sending duplicate chunks)
                        new_content = full_response[previous_length:]
                        if new_content.strip():
                            emit('chat_response_chunk', {
                                'content': new_content,
                                'model': model,
                                'is_complete': False,
                                'timestamp': datetime.now().isoformat()
                            })
                            previous_length = len(full_response)
            
            # Clean up the response (remove extra whitespace, etc.)
            full_response = full_response.strip()
            
            # Post-process the response to ensure single-file format for web development
            full_response = post_process_web_development_response(full_response, model)
            
            # Save assistant message to database if session_id provided and streaming wasn't stopped
            if session_id and not is_streaming_stopped(session_id, user_id):
                save_chat_message(session_id, 'assistant', full_response, model)
            
            # Send completion signal with full response
            emit('chat_response_chunk', {
                'content': '',
                'model': model,
                'is_complete': True,
                'full_response': full_response,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as ollama_error:
            logger.error(f"Ollama streaming error: {ollama_error}")
            emit('error', {
                'error': f'Failed to generate response: {str(ollama_error)}',
                'type': 'ollama_error'
            })
        finally:
            # Clean up streaming session
            cleanup_stream_session(session_id, user_id)
        
    except Exception as e:
        logger.error(f"Error in chat message handler: {e}")
        emit('error', {
            'error': 'Failed to process message',
            'type': 'server_error'
        })
        # Clean up streaming session on error
        if 'session_id' in locals() and 'user_id' in locals():
            cleanup_stream_session(session_id, user_id)

def detect_content_type(content):
    """Detect the content type of a chunk based on its content"""
    content_lower = content.lower().strip()
    
    # HTML detection - improved to catch more HTML patterns
    if (content_lower.startswith('<html') or 
        content_lower.startswith('<!doctype') or 
        content_lower.startswith('<!doctype html') or
        '<html' in content_lower or 
        '<head>' in content_lower or 
        '<body>' in content_lower or
        '<div' in content_lower or 
        '<p>' in content_lower or
        '<!doctype html>' in content_lower):
        return 'html'
    
    # CSS detection
    if (content_lower.startswith('css') or 
        '{' in content_lower and ':' in content_lower and ';' in content_lower or
        'background-color:' in content_lower or
        'color:' in content_lower or
        'font-family:' in content_lower):
        return 'css'
    
    # JavaScript detection
    if (content_lower.startswith('javascript') or 
        content_lower.startswith('js') or 
        'function' in content_lower or 
        'const ' in content_lower or 
        'let ' in content_lower or 
        'var ' in content_lower or
        'document.' in content_lower or
        'window.' in content_lower or
        'addEventListener' in content_lower):
        return 'javascript'
    
    # Code block detection (markdown)
    if content_lower.startswith('```') or content_lower.startswith('`'):
        return 'code'
    
    # File extension detection
    if any(ext in content_lower for ext in ['.html', '.css', '.js', '.py', '.java', '.cpp', '.c', '.php', '.rb', '.go', '.rs', '.ts', '.jsx', '.tsx']):
        return 'code'
    
    # Default to text
    return 'text'

@socketio.on('chat_message_v2')
def handle_chat_message_v2(data):
    """Handle real-time chat messages with streaming and metadata for chunks"""
    try:
        print(f"V2 Handler called with data: {data}")
        print(f"Data type: {type(data)}")
        print(f"Data keys: {data.keys() if isinstance(data, dict) else 'Not a dict'}")
        message = data.get('message', '').strip()
        print(f"Extracted message: '{message}'")
        print(f"Message length: {len(message)}")
        model = data.get('model', 'qwen2.5-coder:7b')
        session_id = data.get('session_id')
        print(f"🔍 V2 Handler - session_id from data: {session_id}")
        frontend_history = data.get('history', [])  
        system_prompt = data.get('system_prompt', load_system_prompt())
        
        # Get user ID if authenticated
        user_id = current_user.id if hasattr(current_user, 'id') else None
        
        if not message:
            emit('error', {'error': 'Message is required and cannot be empty'})
            return
        
        # Check Ollama connection
        if not check_ollama_connection():
            emit('error', {'error': 'Ollama service is not available'})
            return
        
        # Initialize streaming session tracking
        stream_key = get_stream_key(session_id, user_id)
        active_streams[stream_key] = True
        
        # Get conversation history - prioritize frontend history, fallback to database
        conversation_history = []
        
        if frontend_history:
            # Use history from frontend (most up-to-date)
            conversation_history = frontend_history
            logger.info(f"Using frontend history: {len(conversation_history)} messages")
        elif session_id:
            # Fallback to database history if no frontend history
            try:
                # Verify session belongs to user (if authenticated)
                if user_id:
                    session_obj = ChatSession.query.filter_by(
                        id=session_id, 
                        user_id=user_id,
                        is_active=True
                    ).first()
                    if not session_obj:
                        emit('error', {'error': 'Session not found'})
                        cleanup_stream_session(session_id, user_id)
                        return
                
                # Get messages from database
                db_messages = get_chat_messages(session_id)
                conversation_history = [
                    {'role': msg['role'], 'content': msg['content']} 
                    for msg in db_messages
                ]
                logger.info(f"Using database history: {len(conversation_history)} messages")
            except Exception as e:
                logger.error(f"Error getting conversation history: {e}")
        
        # Prepare conversation context
        messages = [{'role': 'system', 'content': system_prompt}]
        
        # Add conversation history (limit to last 20 messages for better context)
        if conversation_history:
            recent_history = conversation_history[-20:]
            messages.extend(recent_history)
            logger.info(f"Added {len(recent_history)} messages to context")
        
        # Add current message
        messages.append({'role': 'user', 'content': message})
        
        # Save user message to database if session_id provided
        if session_id:
            save_chat_message(session_id, 'user', message, model)
        
        # Stream response using Ollama
        full_response = ""
        previous_length = 0  # Track previous response length to avoid duplication
        current_chunk_buffer = ""  # Buffer for accumulating chunks to detect content type
        
        try:
            for chunk in ollama.chat(
                model=model,
                messages=messages,
                stream=True,
                options=DEFAULT_TOKEN_LIMITS
            ):
                # Check if streaming has been stopped
                if is_streaming_stopped(session_id, user_id):
                    logger.info(f"Streaming stopped for session {session_id}")
                    emit('chat_response_stopped', {
                        'session_id': session_id,
                        'message': 'Response generation stopped by user',
                        'timestamp': datetime.now().isoformat()
                    })
                    break
                
                if 'message' in chunk and 'content' in chunk['message']:
                    content = chunk['message']['content']
                    if content:
                        full_response += content
                        current_chunk_buffer += content
                        
                        # Only emit new content (avoid sending duplicate chunks)
                        new_content = full_response[previous_length:]
                        if new_content.strip():
                            # Detect content type for this chunk
                            content_type = detect_content_type(current_chunk_buffer)
                            
                            # Prepare metadata based on content type
                            metadata = {
                                'content_type': content_type,
                                'language': None,
                                'file_extension': None,
                                'is_code_block': content_type in ['html', 'css', 'javascript', 'code'],
                                'is_executable': content_type in ['html', 'javascript'],
                                'requires_syntax_highlighting': content_type in ['html', 'css', 'javascript', 'code']
                            }
                            
                            # Add language detection for code blocks
                            if content_type == 'code':
                                # Try to detect language from markdown code blocks
                                if '```' in current_chunk_buffer:
                                    lines = current_chunk_buffer.split('\n')
                                    for line in lines:
                                        if line.strip().startswith('```'):
                                            lang = line.strip()[3:].strip()
                                            if lang:
                                                metadata['language'] = lang
                                                break
                            
                            # Add file extension for code content
                            if content_type in ['html', 'css', 'javascript']:
                                extensions = {
                                    'html': '.html',
                                    'css': '.css', 
                                    'javascript': '.js'
                                }
                                metadata['file_extension'] = extensions.get(content_type)
                            
                            # Debug logging for chunk emission
                            logger.info(f"📤 Emitting V2 chunk: content_type={metadata['content_type']}, "
                                      f"is_code_block={metadata['is_code_block']}, "
                                      f"language={metadata.get('language')}, "
                                      f"content_length={len(new_content)}")
                            
                            emit('chat_response_chunk_v2', {
                                'content': new_content,
                                'model': model,
                                'is_complete': False,
                                'metadata': metadata,
                                'timestamp': datetime.now().isoformat()
                            })
                            previous_length = len(full_response)
                            
                            # Reset buffer periodically to avoid memory issues
                            if len(current_chunk_buffer) > 1000:
                                current_chunk_buffer = current_chunk_buffer[-500:]
            
            # Clean up the response (remove extra whitespace, etc.)
            full_response = full_response.strip()
            
            # Save assistant message to database if session_id provided and streaming wasn't stopped
            if session_id and not is_streaming_stopped(session_id, user_id):
                save_chat_message(session_id, 'assistant', full_response, model)
            
            # Send completion signal with full response and final metadata
            final_content_type = detect_content_type(full_response)
            final_metadata = {
                'content_type': final_content_type,
                'language': None,
                'file_extension': None,
                'is_code_block': final_content_type in ['html', 'css', 'javascript', 'code'],
                'is_executable': final_content_type in ['html', 'javascript'],
                'requires_syntax_highlighting': final_content_type in ['html', 'css', 'javascript', 'code'],
                'total_length': len(full_response)
            }
            
            # Debug logging for final chunk
            logger.info(f"✅ Emitting final V2 chunk: content_type={final_metadata['content_type']}, "
                      f"total_length={final_metadata['total_length']}, "
                      f"is_code_block={final_metadata['is_code_block']}")
            
            emit('chat_response_chunk_v2', {
                'content': '',
                'model': model,
                'is_complete': True,
                'full_response': full_response,
                'metadata': final_metadata,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as ollama_error:
            logger.error(f"Ollama streaming error: {ollama_error}")
            emit('error', {
                'error': f'Failed to generate response: {str(ollama_error)}',
                'type': 'ollama_error'
            })
        finally:
            # Clean up streaming session
            cleanup_stream_session(session_id, user_id)
        
    except Exception as e:
        logger.error(f"Error in chat message v2 handler: {e}")
        emit('error', {
            'error': 'Failed to process message',
            'type': 'server_error'
        })
        # Clean up streaming session on error
        if 'session_id' in locals() and 'user_id' in locals():
            cleanup_stream_session(session_id, user_id)

@socketio.on('stop_generation')
def handle_stop_generation(data):
    """Stop ongoing response generation"""
    try:
        session_id = data.get('session_id')
        user_id = current_user.id if hasattr(current_user, 'id') else None
        
        if not session_id:
            emit('error', {'error': 'Session ID is required'})
            return
        
        # Stop the streaming
        if stop_streaming(session_id, user_id):
            emit('generation_stopped', {
                'session_id': session_id,
                'message': 'Response generation stopped successfully',
                'timestamp': datetime.now().isoformat()
            })
            logger.info(f"Generation stopped for session {session_id}")
        else:
            emit('error', {'error': 'No active generation found for this session'})
            
    except Exception as e:
        logger.error(f"Error stopping generation: {e}")
        emit('error', {'error': 'Failed to stop generation'})

@socketio.on('new_chat')
def handle_new_chat(data):
    """Start a new chat session"""
    try:
        user_id = current_user.id if hasattr(current_user, 'id') else None
        model = data.get('model', 'qwen2.5:7b')
        
        # Stop any ongoing generation first
        if 'session_id' in data:
            stop_streaming(data['session_id'], user_id)
        
        # Create new chat session
        session_result = create_new_chat_session(user_id)
        
        if session_result['success']:
            # Update session model if user is authenticated
            if user_id and session_result['session_id']:
                try:
                    session_obj = ChatSession.query.get(session_result['session_id'])
                    if session_obj:
                        session_obj.model_used = model
                        db.session.commit()
                except Exception as e:
                    logger.error(f"Error updating session model: {e}")
            
            emit('new_chat_created', {
                'session_id': session_result['session_id'],
                'model': model,
                'message': session_result['message'],
                'timestamp': datetime.now().isoformat()
            })
            logger.info(f"New chat session created: {session_result['session_id']}")
        else:
            emit('error', {'error': session_result['message']})
            
    except Exception as e:
        logger.error(f"Error creating new chat: {e}")
        emit('error', {'error': 'Failed to create new chat session'})

@socketio.on('model_change')
def handle_model_change(data):
    """Handle model change requests"""
    try:
        model = data.get('model', 'qwen2.5:8b')
        logger.info(f"Model changed to: {model}")
        emit('model_changed', {
            'model': model,
            'timestamp': datetime.now().isoformat(),
            'status': 'success'
        })
    except Exception as e:
        logger.error(f"Error changing model: {e}")
        emit('error', {
            'error': 'Failed to change model',
            'type': 'server_error'
        })

@socketio.on('get_models')
def handle_get_models():
    """Handle request for available models via WebSocket"""
    try:
        installed_models = get_available_models()
        available_models = []
        for model in AVAILABLE_MODELS:
            if model['id'] in installed_models:
                available_models.append(model)
        
        emit('models_list', {
            'models': available_models,
            'total': len(available_models),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting models via WebSocket: {e}")
        emit('error', {
            'error': 'Failed to get models',
            'type': 'server_error'
        })

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'Not Found',
        'message': 'The requested resource was not found',
        'available_endpoints': {
            'root': '/',
            'health': '/api/health',
            'models': '/api/models',
            'chat': '/api/chat',
            'upload': '/api/upload',
            'stop_generation': '/api/stop-generation',
            'new_chat': '/api/new-chat'
        }
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': 'Internal Server Error',
        'message': 'An unexpected error occurred'
    }), 500

@app.route('/api/debug/current-user', methods=['GET'])
@login_required
def debug_current_user():
    """Debug endpoint to show current user information"""
    try:
        return jsonify({
            'current_user': {
                'id': current_user.id,
                'username': current_user.username,
                'email': current_user.email
            },
            'success': True
        }), 200
    except Exception as e:
        logger.error(f"Debug current user error: {e}")
        return jsonify({'error': 'Failed to get current user info'}), 500

# React Project API Endpoints
@app.route('/api/projects/save', methods=['POST'])
@jwt_required
def save_react_project():
    """Save a React project to the projects folder"""
    try:
        data = request.get_json()
        content = data.get('content', '')
        user_id = get_current_user().id if hasattr(get_current_user(), 'id') else None
        
        if not content:
            return jsonify({'error': 'Content is required'}), 400
        
        # Check if content looks like a React project
        if not _is_react_project_content(content):
            return jsonify({'error': 'Content does not appear to be a React project'}), 400
        
        result = project_saver.save_react_project(content, user_id)
        
        if result['success']:
            return jsonify({
                'success': True,
                'project_name': result['project_name'],
                'project_path': result['project_path'],
                'files': result['files']
            })
        else:
            return jsonify({'error': result['error']}), 500
            
    except Exception as e:
        logger.error(f"Error saving React project: {e}")
        return jsonify({'error': 'Failed to save project'}), 500

@app.route('/api/projects', methods=['GET'])
@jwt_required
def list_projects():
    """List all projects for the current user"""
    try:
        user_id = get_current_user().id if hasattr(get_current_user(), 'id') else None
        projects = project_saver.list_projects(user_id)
        return jsonify({'projects': projects})
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        return jsonify({'error': 'Failed to list projects'}), 500

@app.route('/api/projects/<project_name>', methods=['GET'])
@jwt_required
def get_project(project_name):
    """Get project details by name"""
    try:
        project = project_saver.get_project(project_name)
        if project:
            return jsonify({'project': project})
        else:
            return jsonify({'error': 'Project not found'}), 404
    except Exception as e:
        logger.error(f"Error getting project {project_name}: {e}")
        return jsonify({'error': 'Failed to get project'}), 500

def _is_react_project_content(content):
    """Check if content appears to be a React project"""
    react_indicators = [
        'package.json',
        'vite.config.js',
        'src/main.jsx',
        'src/App.jsx',
        'index.html',
        'React',
        'react-dom',
        'vite'
    ]
    
    content_lower = content.lower()
    return any(indicator.lower() in content_lower for indicator in react_indicators)

def _is_react_project_request(message):
    """Check if the user message is requesting a React project"""
    message_lower = message.lower()
    react_keywords = [
        'react app',
        'react application',
        'react project',
        'create a react',
        'build a react',
        'make a react',
        'react todo',
        'react counter',
        'react dashboard',
        'react calculator',
        'react weather',
        'react chat',
        'react portfolio',
        'react ecommerce',
        'react blog',
        'react game'
    ]
    
    return any(keyword in message_lower for keyword in react_keywords)

if __name__ == '__main__':
    # Create database tables
    with app.app_context():
        db.create_all()
        logger.info("✅ Database tables created/verified")
    
    # Check Ollama connection on startup
    if check_ollama_connection():
        logger.info("✅ Ollama is running and accessible")
        
        # Log available models
        installed_models = get_available_models()
        if installed_models:
            logger.info(f"📦 Available models: {', '.join(installed_models)}")
        else:
            logger.warning("⚠️  No models found in Ollama. Please install models using 'ollama pull <model_name>'")
    else:
        logger.warning("⚠️  Ollama is not running. Please start Ollama before using the chatbot.")
        logger.info("💡 Start Ollama with: 'ollama serve' or start the Ollama application")
    
    # Run the application
    logger.info("🚀 Starting Flask-SocketIO server...")
    logger.info("📡 Server will be available at: http://127.0.0.1:5000")
    logger.info("🔌 WebSocket endpoint: ws://127.0.0.1:5000/socket.io/")
    logger.info("🔐 Authentication endpoints available at /api/auth/*")
    
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=5000, 
        debug=False,  # Set to True for development
        use_reloader=False,
        allow_unsafe_werkzeug=True
    )
