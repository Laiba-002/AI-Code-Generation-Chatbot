# from flask_sqlalchemy import SQLAlchemy
# from flask_login import UserMixin
# from datetime import datetime

# db = SQLAlchemy()

# class User(UserMixin, db.Model):
#     """User model for authentication and profile management"""
#     id = db.Column(db.Integer, primary_key=True)
#     email = db.Column(db.String(120), unique=True, nullable=False)
#     username = db.Column(db.String(80), unique=True, nullable=False)
#     password_hash = db.Column(db.String(255), nullable=False)
#     created_at = db.Column(db.DateTime, default=datetime.utcnow)
#     last_login = db.Column(db.DateTime, default=datetime.utcnow)
#     is_active = db.Column(db.Boolean, default=True)
    
#     # Relationship to chat sessions
#     chat_sessions = db.relationship('ChatSession', backref='user', lazy=True, cascade='all, delete-orphan')
    
#     def __repr__(self):
#         return f'<User {self.username}>'

# class ChatSession(db.Model):
#     """Chat session model to group related messages"""
#     id = db.Column(db.Integer, primary_key=True)
#     user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
#     title = db.Column(db.String(200), nullable=True)
#     model_used = db.Column(db.String(50), nullable=False, default='qwen2.5:8b')
#     created_at = db.Column(db.DateTime, default=datetime.utcnow)
#     updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
#     is_active = db.Column(db.Boolean, default=True)
    
#     # Relationship to messages
#     messages = db.relationship('ChatMessage', backref='session', lazy=True, cascade='all, delete-orphan')
    
#     def __repr__(self):
#         return f'<ChatSession {self.id} - {self.title}>'

# class ChatMessage(db.Model):
#     """Individual chat message model"""
#     id = db.Column(db.Integer, primary_key=True)
#     session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=False)
#     role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
#     content = db.Column(db.Text, nullable=False)
#     model_used = db.Column(db.String(50), nullable=True)
#     timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
#     def __repr__(self):
#         return f'<ChatMessage {self.id} - {self.role}>' 



















from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy import Text
import json

db = SQLAlchemy()

class User(UserMixin, db.Model):
    """User model for authentication and profile management"""
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)  # Nullable for OAuth users
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # OAuth fields
    oauth_provider = db.Column(db.String(20), nullable=True)  # 'google', 'github', etc.
    oauth_provider_id = db.Column(db.String(100), nullable=True)  # Provider's user ID
    oauth_profile_data = db.Column(JSON, nullable=True)  # Store additional OAuth data
    
    # Integration tokens (in production, these should be encrypted)
    github_token = db.Column(db.String(255), nullable=True)  # GitHub access token
    google_drive_token = db.Column(db.String(255), nullable=True)  # Google Drive token
    
    # Relationship to chat sessions
    chat_sessions = db.relationship('ChatSession', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    @property
    def is_oauth_user(self):
        """Check if user was created via OAuth"""
        return self.oauth_provider is not None
    
    def get_artifacts(self, limit=50, artifact_type=None, active_only=True):
        """Get user artifacts with optional filtering"""
        query = self.artifacts
        
        if active_only:
            query = query.filter_by(is_active=True)
        
        if artifact_type:
            query = query.filter_by(artifact_type=artifact_type)
        
        return query.order_by(Artifact.updated_at.desc()).limit(limit).all()

    def get_artifact_count(self):
        """Get total number of user artifacts"""
        return self.artifacts.filter_by(is_active=True).count()

    def get_recent_artifacts(self, days=7, limit=10):
        """Get recently created/updated artifacts"""
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)
        return self.artifacts.filter(
            Artifact.is_active == True,
            Artifact.updated_at >= cutoff
        ).order_by(Artifact.updated_at.desc()).limit(limit).all()

class UserSession(db.Model):
    """User session model for JWT token management"""
    __tablename__ = 'user_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    session_token = db.Column(db.String(255), unique=True, nullable=False)  # JWT token
    refresh_token = db.Column(db.String(255), unique=True, nullable=True)  # Refresh token
    device_info = db.Column(db.String(200), nullable=True)  # Browser/device info
    ip_address = db.Column(db.String(45), nullable=True)  # IP address
    user_agent = db.Column(db.String(500), nullable=True)  # User agent string
    is_active = db.Column(db.Boolean, default=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_used_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to user
    user = db.relationship('User', backref=db.backref('sessions', lazy='dynamic'))
    
    def __repr__(self):
        return f'<UserSession {self.id} - User {self.user_id}>'
    
    def is_expired(self):
        """Check if session is expired"""
        return datetime.utcnow() > self.expires_at
    
    def to_dict(self):
        """Convert session to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'device_info': self.device_info,
            'ip_address': self.ip_address,
            'is_active': self.is_active,
            'expires_at': self.expires_at.isoformat(),
            'created_at': self.created_at.isoformat(),
            'last_used_at': self.last_used_at.isoformat()
        }

class ChatSession(db.Model):
    """Chat session model to group related messages"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=True)
    model_used = db.Column(db.String(50), nullable=False, default='qwen2.5:8b')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationship to messages
    messages = db.relationship('ChatMessage', backref='session', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<ChatSession {self.id} - {self.title}>'
    
    def get_artifacts(self):
        """Get all artifacts created in this session"""
        return self.artifacts.filter_by(is_active=True).order_by(Artifact.created_at.desc()).all()

    def get_artifact_count(self):
        """Get number of artifacts in this session"""
        return self.artifacts.filter_by(is_active=True).count()

class ChatMessage(db.Model):
    """Individual chat message model"""
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'user' or 'assistant'
    content = db.Column(db.Text, nullable=False)
    model_used = db.Column(db.String(50), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<ChatMessage {self.id} - {self.role}>'

class Artifact(db.Model):
    """Artifact model for storing user-created artifacts"""
    __tablename__ = 'artifacts'
    
    id = db.Column(db.String(36), primary_key=True)  # UUID
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Optional for anonymous users
    session_id = db.Column(db.Integer, db.ForeignKey('chat_session.id'), nullable=True)  # Link to chat session
    
    # Artifact metadata
    title = db.Column(db.String(200), nullable=False, default='Untitled Artifact')
    artifact_type = db.Column(db.String(50), nullable=False)  # MIME type
    language = db.Column(db.String(20), nullable=True)  # Programming language if applicable
    
    # Content
    content = db.Column(Text, nullable=False)  # The actual artifact content
    
    # Metadata stored as JSON
    artifact_metadata = db.Column(JSON, nullable=True, default=dict)  # Additional metadata
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Status
    is_active = db.Column(db.Boolean, default=True)
    is_public = db.Column(db.Boolean, default=False)  # For sharing artifacts
    
    # Versioning
    version = db.Column(db.Integer, default=1)
    parent_id = db.Column(db.String(36), db.ForeignKey('artifacts.id'), nullable=True)  # For version history
    
    # Execution tracking
    execution_count = db.Column(db.Integer, default=0)
    last_executed_at = db.Column(db.DateTime, nullable=True)
    
    # Relationships
    user = db.relationship('User', backref=db.backref('artifacts', lazy='dynamic'))
    session = db.relationship('ChatSession', backref=db.backref('artifacts', lazy='dynamic'))
    parent = db.relationship('Artifact', remote_side=[id], backref='versions')
    
    def __repr__(self):
        return f'<Artifact {self.id} - {self.title}>'
    
    def to_dict(self):
        """Convert artifact to dictionary"""
        return {
            'id': self.id,
            'title': self.title,
            'type': self.artifact_type,
            'language': self.language,
            'content': self.content,
            'metadata': self.artifact_metadata or {},
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'version': self.version,
            'execution_count': self.execution_count,
            'last_executed_at': self.last_executed_at.isoformat() if self.last_executed_at else None,
            'is_public': self.is_public,
            'user_id': self.user_id,
            'session_id': self.session_id
        }

class ArtifactExecution(db.Model):
    """Track artifact execution history"""
    __tablename__ = 'artifact_executions'
    
    id = db.Column(db.Integer, primary_key=True)
    artifact_id = db.Column(db.String(36), db.ForeignKey('artifacts.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    
    # Execution details
    execution_time = db.Column(db.Float, nullable=True)  # Execution time in seconds
    success = db.Column(db.Boolean, nullable=False)
    output = db.Column(Text, nullable=True)  # Execution output
    error = db.Column(Text, nullable=True)  # Error message if failed
    
    # Environment info
    language = db.Column(db.String(20), nullable=True)
    runtime_version = db.Column(db.String(50), nullable=True)
    
    # Timestamp
    executed_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    artifact = db.relationship('Artifact', backref=db.backref('executions', lazy='dynamic'))
    user = db.relationship('User', backref=db.backref('artifact_executions', lazy='dynamic'))
    
    def __repr__(self):
        return f'<ArtifactExecution {self.id} - {self.artifact_id}>'

class ArtifactShare(db.Model):
    """Track shared artifacts"""
    __tablename__ = 'artifact_shares'
    
    id = db.Column(db.Integer, primary_key=True)
    artifact_id = db.Column(db.String(36), db.ForeignKey('artifacts.id'), nullable=False)
    shared_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    shared_with = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Null for public shares
    
    # Share settings
    share_token = db.Column(db.String(64), unique=True, nullable=False)  # Unique token for sharing
    can_edit = db.Column(db.Boolean, default=False)
    can_execute = db.Column(db.Boolean, default=True)
    expires_at = db.Column(db.DateTime, nullable=True)  # Optional expiration
    
    # Tracking
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    access_count = db.Column(db.Integer, default=0)
    last_accessed_at = db.Column(db.DateTime, nullable=True)
    
    # Status
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    artifact = db.relationship('Artifact', backref=db.backref('shares', lazy='dynamic'))
    sharer = db.relationship('User', foreign_keys=[shared_by], backref=db.backref('shared_artifacts', lazy='dynamic'))
    recipient = db.relationship('User', foreign_keys=[shared_with], backref=db.backref('received_artifacts', lazy='dynamic'))
    
    def __repr__(self):
        return f'<ArtifactShare {self.id} - {self.artifact_id}>'