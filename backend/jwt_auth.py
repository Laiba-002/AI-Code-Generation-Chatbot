import jwt
import secrets
import uuid
from datetime import datetime, timedelta
from flask import request, jsonify, current_app
from functools import wraps
from models import db, User, UserSession
from flask_bcrypt import Bcrypt
import re

class JWTAuth:
    def __init__(self, app=None):
        self.app = app
        self.bcrypt = Bcrypt()
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        self.app = app
        self.bcrypt.init_app(app)
        # JWT configuration
        app.config.setdefault('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
        app.config.setdefault('JWT_ACCESS_TOKEN_EXPIRES', timedelta(hours=1))
        app.config.setdefault('JWT_REFRESH_TOKEN_EXPIRES', timedelta(days=30))
        app.config.setdefault('JWT_ALGORITHM', 'HS256')
    
    def generate_tokens(self, user_id):
        """Generate access and refresh tokens for a user"""
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Create access token
        access_token_payload = {
            'user_id': user_id,
            'session_id': session_id,
            'type': 'access',
            'exp': datetime.utcnow() + current_app.config['JWT_ACCESS_TOKEN_EXPIRES']
        }
        
        # Create refresh token
        refresh_token_payload = {
            'user_id': user_id,
            'session_id': session_id,
            'type': 'refresh',
            'exp': datetime.utcnow() + current_app.config['JWT_REFRESH_TOKEN_EXPIRES']
        }
        
        access_token = jwt.encode(
            access_token_payload, 
            current_app.config['JWT_SECRET_KEY'], 
            algorithm=current_app.config['JWT_ALGORITHM']
        )
        
        refresh_token = jwt.encode(
            refresh_token_payload, 
            current_app.config['JWT_SECRET_KEY'], 
            algorithm=current_app.config['JWT_ALGORITHM']
        )
        
        # Store session in database
        self._create_user_session(user_id, session_id, access_token, refresh_token)
        
        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_in': int(current_app.config['JWT_ACCESS_TOKEN_EXPIRES'].total_seconds())
        }
    
    def _create_user_session(self, user_id, session_id, access_token, refresh_token):
        """Create a new user session in the database"""
        try:
            # Get device info
            device_info = self._get_device_info()
            ip_address = self._get_client_ip()
            user_agent = request.headers.get('User-Agent', '')
            
            # Create session
            session = UserSession(
                user_id=user_id,
                session_token=session_id,
                refresh_token=refresh_token,
                device_info=device_info,
                ip_address=ip_address,
                user_agent=user_agent,
                expires_at=datetime.utcnow() + current_app.config['JWT_REFRESH_TOKEN_EXPIRES']
            )
            
            db.session.add(session)
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            raise e
    
    def _get_device_info(self):
        """Extract device information from request"""
        user_agent = request.headers.get('User-Agent', '')
        if 'Mobile' in user_agent:
            return 'Mobile'
        elif 'Tablet' in user_agent:
            return 'Tablet'
        else:
            return 'Desktop'
    
    def _get_client_ip(self):
        """Get client IP address"""
        if request.headers.get('X-Forwarded-For'):
            return request.headers.get('X-Forwarded-For').split(',')[0]
        return request.remote_addr
    
    def verify_token(self, token):
        """Verify JWT token and return user"""
        try:
            payload = jwt.decode(
                token, 
                current_app.config['JWT_SECRET_KEY'], 
                algorithms=[current_app.config['JWT_ALGORITHM']]
            )
            
            # Check if session exists and is active
            session = UserSession.query.filter_by(
                session_token=payload.get('session_id'),
                is_active=True
            ).first()
            
            if not session or session.is_expired():
                return None
            
            # Update last used timestamp
            session.last_used_at = datetime.utcnow()
            db.session.commit()
            
            # Get user
            user = User.query.get(payload.get('user_id'))
            if not user or not user.is_active:
                return None
            
            return user
            
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        except Exception as e:
            current_app.logger.error(f"Token verification error: {e}")
            return None
    
    def refresh_token(self, refresh_token):
        """Refresh access token using refresh token"""
        try:
            payload = jwt.decode(
                refresh_token, 
                current_app.config['JWT_SECRET_KEY'], 
                algorithms=[current_app.config['JWT_ALGORITHM']]
            )
            
            # Verify refresh token type
            if payload.get('type') != 'refresh':
                return None
            
            # Check if session exists and is active
            session = UserSession.query.filter_by(
                session_token=payload.get('session_id'),
                is_active=True
            ).first()
            
            if not session or session.is_expired():
                return None
            
            # Generate new access token
            new_access_token_payload = {
                'user_id': payload.get('user_id'),
                'session_id': payload.get('session_id'),
                'type': 'access',
                'exp': datetime.utcnow() + current_app.config['JWT_ACCESS_TOKEN_EXPIRES']
            }
            
            new_access_token = jwt.encode(
                new_access_token_payload, 
                current_app.config['JWT_SECRET_KEY'], 
                algorithm=current_app.config['JWT_ALGORITHM']
            )
            
            return {
                'access_token': new_access_token,
                'expires_in': int(current_app.config['JWT_ACCESS_TOKEN_EXPIRES'].total_seconds())
            }
            
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        except Exception as e:
            current_app.logger.error(f"Token refresh error: {e}")
            return None
    
    def revoke_session(self, session_id):
        """Revoke a specific session"""
        try:
            session = UserSession.query.filter_by(session_token=session_id).first()
            if session:
                session.is_active = False
                db.session.commit()
                return True
            return False
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Session revocation error: {e}")
            return False
    
    def revoke_all_user_sessions(self, user_id):
        """Revoke all sessions for a user"""
        try:
            sessions = UserSession.query.filter_by(user_id=user_id, is_active=True).all()
            for session in sessions:
                session.is_active = False
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"User sessions revocation error: {e}")
            return False
    
    def get_user_sessions(self, user_id):
        """Get all active sessions for a user"""
        try:
            sessions = UserSession.query.filter_by(
                user_id=user_id, 
                is_active=True
            ).order_by(UserSession.created_at.desc()).all()
            
            return [session.to_dict() for session in sessions]
        except Exception as e:
            current_app.logger.error(f"Get user sessions error: {e}")
            return []

# Create JWT auth instance
jwt_auth = JWTAuth()

def jwt_required(f):
    """Decorator to require JWT authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        user = jwt_auth.verify_token(token)
        if not user:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)
    
    return decorated_function

def get_current_user():
    """Get current user from request context"""
    return getattr(request, 'current_user', None)

# User management functions
def register_user(email, username, password):
    """Register a new user"""
    try:
        # Validate input
        if not validate_email(email):
            return False, "Invalid email format"
        
        is_valid, message = validate_username(username)
        if not is_valid:
            return False, message
        
        is_valid, message = validate_password(password)
        if not is_valid:
            return False, message
        
        # Check if user already exists
        if User.query.filter_by(email=email).first():
            return False, "Email already registered"
        
        if User.query.filter_by(username=username).first():
            return False, "Username already taken"
        
        # Create new user
        password_hash = jwt_auth.bcrypt.generate_password_hash(password).decode('utf-8')
        new_user = User(
            email=email,
            username=username,
            password_hash=password_hash
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        return True, "User registered successfully"
        
    except Exception as e:
        db.session.rollback()
        return False, f"Registration failed: {str(e)}"

def login_user_by_credentials(email, password):
    """Login user with email and password"""
    try:
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return False, "Invalid email or password"
        
        if not jwt_auth.bcrypt.check_password_hash(user.password_hash, password):
            return False, "Invalid email or password"
        
        if not user.is_active:
            return False, "Account is deactivated"
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Generate JWT tokens
        tokens = jwt_auth.generate_tokens(user.id)
        
        return True, {
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'created_at': user.created_at.isoformat(),
                'last_login': user.last_login.isoformat()
            },
            'tokens': tokens
        }
        
    except Exception as e:
        return False, f"Login failed: {str(e)}"

def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_password(password):
    """Validate password strength"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    return True, "Password is valid"

def validate_username(username):
    """Validate username format"""
    if len(username) < 3 or len(username) > 20:
        return False, "Username must be between 3 and 20 characters"
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers, and underscores"
    return True, "Username is valid"
