from flask import request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from flask_bcrypt import Bcrypt
from models import db, User, ChatSession, ChatMessage
from datetime import datetime
import re
import ollama
import logging

logger = logging.getLogger(__name__)

bcrypt = Bcrypt()

def generate_chat_title(first_message_content):
    """Generate an enhanced chat title using AI based on the first user message"""
    try:
        # Clean the input message
        clean_content = first_message_content.strip()
        if not clean_content:
            return "New Chat"
        
        # If message is too short, use it directly with minor enhancement
        if len(clean_content) <= 30:
            # Simple enhancement for short messages
            if clean_content.lower().startswith(('hi', 'hello', 'hey')):
                return "General Conversation"
            elif any(word in clean_content.lower() for word in ['help', 'how', 'what', 'explain']):
                return f"Help Request"
            else:
                return clean_content.title()
        
        # For longer messages, use AI to generate a concise title
        title_prompt = f"""Generate a concise, descriptive title (3-6 words) for a chat conversation that starts with this user message:

"{clean_content[:200]}"

Requirements:
- Keep it under 50 characters
- Make it descriptive but concise
- Focus on the main topic or intent
- Use title case
- No quotes or special formatting

Title:"""

        try:
            response = ollama.generate(
                model='llama3.2:8b',  # Use a fast, small model for title generation
                prompt=title_prompt,
                options={
                    'temperature': 0.3,  # Lower temperature for more consistent titles
                    'num_predict': 20,   # Limit output length
                    'stop': ['\n', '.', '!', '?']  # Stop at sentence endings
                }
            )
            
            generated_title = response['response'].strip()
            
            # Clean and validate the generated title
            if generated_title:
                # Remove quotes and clean up
                generated_title = generated_title.strip('"\'').strip()
                # Limit length
                if len(generated_title) > 50:
                    generated_title = generated_title[:47] + "..."
                # Ensure it's not empty after cleaning
                if generated_title:
                    return generated_title
            
        except Exception as e:
            logger.warning(f"AI title generation failed: {e}")
        
        # Fallback: create a title from the first few words
        words = clean_content.split()[:6]  # Take first 6 words
        fallback_title = ' '.join(words)
        if len(fallback_title) > 50:
            fallback_title = fallback_title[:47] + "..."
        
        return fallback_title.title()
        
    except Exception as e:
        logger.error(f"Error generating chat title: {e}")
        return "New Chat"

def init_auth(app):
    """Initialize authentication with the Flask app"""
    bcrypt.init_app(app)

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
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
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
        
        if not bcrypt.check_password_hash(user.password_hash, password):
            return False, "Invalid email or password"
        
        if not user.is_active:
            return False, "Account is deactivated"
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Login the user
        login_user(user, remember=True)
        
        return True, "Login successful"
        
    except Exception as e:
        return False, f"Login failed: {str(e)}"

def get_user_chat_sessions(user_id):
    """Get all chat sessions for a user"""
    try:
        print(f"Getting sessions for user {user_id}")
        sessions = ChatSession.query.filter_by(
            user_id=user_id, 
            is_active=True
        ).order_by(ChatSession.updated_at.desc()).all()
        
        print(f"Found {len(sessions)} sessions")
        
        # Update empty titles with AI-generated content
        for session in sessions:
            print(f"Session {session.id}: title='{session.title}', message_count={len(session.messages)}")
            if not session.title and session.messages:
                first_user_message = next((msg for msg in session.messages if msg.role == 'user'), None)
                if first_user_message:
                    # Generate AI-powered title
                    generated_title = generate_chat_title(first_user_message.content)
                    session.title = generated_title
                    db.session.commit()
                    print(f"Generated AI title for session {session.id}: {generated_title}")
        
        result = [{
            'id': session.id,
            'title': session.title or f"Chat {session.id}",
            'model_used': session.model_used,
            'created_at': session.created_at.isoformat(),
            'updated_at': session.updated_at.isoformat(),
            'message_count': len(session.messages)
        } for session in sessions]
        
        print(f"Returning {len(result)} sessions")
        return result
        
    except Exception as e:
        print(f"Error getting sessions for user {user_id}: {e}")
        return []

def create_chat_session(user_id, model='qwen2.5:8b'):
    """Create a new chat session for a user"""
    try:
        session = ChatSession(
            user_id=user_id,
            model_used=model
        )
        db.session.add(session)
        db.session.commit()
        print(f"Created new session {session.id} for user {user_id}")
        return session.id
    except Exception as e:
        db.session.rollback()
        print(f"Error creating session for user {user_id}: {e}")
        return None

def save_chat_message(session_id, role, content, model_used=None):
    """Save a chat message to the database"""
    try:
        print(f"Saving message: session_id={session_id}, role={role}, content_length={len(content)}")
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            model_used=model_used
        )
        db.session.add(message)
        
        # Update session timestamp
        session = ChatSession.query.get(session_id)
        if session:
            session.updated_at = datetime.utcnow()
            
            # Generate AI-powered title based on first user message if not set
            if not session.title and role == 'user':
                generated_title = generate_chat_title(content)
                session.title = generated_title
                print(f"Generated AI title for session {session_id}: {generated_title}")
        
        db.session.commit()
        print(f"Successfully saved message to session {session_id}")
        return True
    except Exception as e:
        db.session.rollback()
        print(f"Error saving message to session {session_id}: {e}")
        return False

def get_chat_messages(session_id):
    """Get all messages for a chat session"""
    try:
        print(f"Getting messages for session {session_id}")
        messages = ChatMessage.query.filter_by(session_id=session_id).order_by(ChatMessage.timestamp).all()
        print(f"Found {len(messages)} messages for session {session_id}")
        
        result = [{
            'id': msg.id,
            'role': msg.role,
            'content': msg.content,
            'model_used': msg.model_used,
            'timestamp': msg.timestamp.isoformat(),
            'attachments': []  # Add empty attachments array for compatibility
        } for msg in messages]
        
        print(f"Returning {len(result)} messages for session {session_id}")
        return result
    except Exception as e:
        print(f"Error getting messages for session {session_id}: {e}")
        return []

def delete_chat_session(session_id, user_id):
    """Delete a chat session (soft delete)"""
    try:
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if session:
            session.is_active = False
            db.session.commit()
            return True
        return False
    except Exception as e:
        db.session.rollback()
        return False 