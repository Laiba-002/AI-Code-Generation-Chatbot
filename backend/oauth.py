from authlib.integrations.flask_client import OAuth
from flask import current_app, url_for, session, redirect, request
from models import db, User
from datetime import datetime
import os
import re

oauth = OAuth()

def init_oauth(app):
    """Initialize OAuth with the Flask app"""
    oauth.init_app(app)
    
    # Configure Google OAuth
    oauth.register(
        name='google',
        client_id=os.getenv('GOOGLE_CLIENT_ID'),
        client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
        access_token_url='https://oauth2.googleapis.com/token',
        access_token_params=None,
        authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
        authorize_params=None,
        api_base_url='https://www.googleapis.com/oauth2/v2/',
        userinfo_endpoint='https://www.googleapis.com/oauth2/v2/userinfo',
        client_kwargs={
            'scope': 'email profile'
        }
    )
    
    # Configure GitHub OAuth
    oauth.register(
        name='github',
        client_id=os.getenv('GITHUB_CLIENT_ID'),
        client_secret=os.getenv('GITHUB_CLIENT_SECRET'),
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        api_base_url='https://api.github.com/',
        client_kwargs={'scope': 'repo,user:email'},
    )

def generate_username_from_email(email, provider):
    """Generate a unique username from email"""
    base_username = email.split('@')[0]
    base_username = re.sub(r'[^a-zA-Z0-9_]', '', base_username)
    
    # Ensure username starts with a letter
    if base_username and not base_username[0].isalpha():
        base_username = f"user_{base_username}"
    
    if not base_username:
        base_username = f"{provider}_user"
    
    # Check if username exists and append number if needed
    counter = 1
    username = base_username
    while User.query.filter_by(username=username).first():
        username = f"{base_username}_{counter}"
        counter += 1
    
    return username

def get_or_create_oauth_user(provider, provider_user_id, email, profile_data):
    """Get existing user or create new one from OAuth data"""
    try:
        # First, try to find user by OAuth provider and provider ID
        user = User.query.filter_by(
            oauth_provider=provider,
            oauth_provider_id=provider_user_id
        ).first()
        
        if user:
            # Update last login and profile data
            user.last_login = datetime.utcnow()
            user.oauth_profile_data = profile_data
            db.session.commit()
            return user
        
        # If not found by OAuth, try to find by email
        user = User.query.filter_by(email=email).first()
        if user:
            # Link existing user to OAuth provider
            user.oauth_provider = provider
            user.oauth_provider_id = provider_user_id
            user.oauth_profile_data = profile_data
            user.last_login = datetime.utcnow()
            db.session.commit()
            return user
        
        # Create new user
        username = generate_username_from_email(email, provider)
        
        new_user = User(
            email=email,
            username=username,
            oauth_provider=provider,
            oauth_provider_id=provider_user_id,
            oauth_profile_data=profile_data,
            password_hash=None  # OAuth users don't need password
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        return new_user
        
    except Exception as e:
        db.session.rollback()
        raise e

def handle_google_oauth():
    """Handle Google OAuth callback"""
    try:
        print("🔍 Starting Google OAuth callback...")
        
        # Get the authorization code from the request
        code = request.args.get('code')
        if not code:
            print("❌ No authorization code received")
            return None
        
        print(f"🔍 Authorization code: {code}")
        
        # Exchange code for access token manually
        import requests
        
        token_url = 'https://oauth2.googleapis.com/token'
        token_data = {
            'client_id': os.getenv('GOOGLE_CLIENT_ID'),
            'client_secret': os.getenv('GOOGLE_CLIENT_SECRET'),
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': 'http://localhost:5000/api/auth/google/callback'
        }
        
        print("🔍 Exchanging code for access token...")
        token_response = requests.post(token_url, data=token_data)
        print(f"🔍 Token response status: {token_response.status_code}")
        print(f"🔍 Token response: {token_response.text}")
        
        if token_response.status_code != 200:
            print(f"❌ Failed to get access token: {token_response.text}")
            return None
        
        token_info = token_response.json()
        access_token = token_info.get('access_token')
        
        if not access_token:
            print("❌ No access token in response")
            return None
        
        print(f"🔍 Access token received: {access_token[:20]}...")
        
        # Get user info using the access token
        userinfo_url = 'https://www.googleapis.com/oauth2/v2/userinfo'
        headers = {'Authorization': f'Bearer {access_token}'}
        
        print("🔍 Getting user info...")
        userinfo_response = requests.get(userinfo_url, headers=headers)
        print(f"🔍 Userinfo response status: {userinfo_response.status_code}")
        print(f"🔍 Userinfo response: {userinfo_response.text}")
        
        if userinfo_response.status_code != 200:
            print(f"❌ Failed to get user info: {userinfo_response.text}")
            return None
        
        userinfo = userinfo_response.json()
        print(f"🔍 User info: {userinfo}")
        
        provider_user_id = userinfo['id']
        email = userinfo['email']
        print(f"🔍 Provider ID: {provider_user_id}")
        print(f"🔍 Email: {email}")
        
        profile_data = {
            'name': userinfo.get('name'),
            'given_name': userinfo.get('given_name'),
            'family_name': userinfo.get('family_name'),
            'picture': userinfo.get('picture'),
            'locale': userinfo.get('locale')
        }
        print(f"🔍 Profile data: {profile_data}")
        
        user = get_or_create_oauth_user('google', provider_user_id, email, profile_data)
        print(f"🔍 User created/found: {user}")
        return user
        
    except Exception as e:
        print(f"❌ Google OAuth error: {e}")
        import traceback
        traceback.print_exc()
        return None

def handle_github_oauth():
    """Handle GitHub OAuth callback"""
    try:
        token = oauth.github.authorize_access_token()
        resp = oauth.github.get('user', token=token)
        userinfo = resp.json()
        
        # Get user emails
        emails_resp = oauth.github.get('user/emails', token=token)
        emails = emails_resp.json()
        
        # Find primary email
        primary_email = None
        for email_info in emails:
            if email_info.get('primary') and email_info.get('verified'):
                primary_email = email_info['email']
                break
        
        if not primary_email:
            # Fallback to user's email if available
            primary_email = userinfo.get('email')
        
        if not primary_email:
            raise Exception("No verified email found")
        
        provider_user_id = str(userinfo['id'])
        profile_data = {
            'login': userinfo.get('login'),
            'name': userinfo.get('name'),
            'avatar_url': userinfo.get('avatar_url'),
            'bio': userinfo.get('bio'),
            'location': userinfo.get('location'),
            'company': userinfo.get('company'),
            'blog': userinfo.get('blog'),
            'public_repos': userinfo.get('public_repos'),
            'followers': userinfo.get('followers'),
            'following': userinfo.get('following')
        }
        
        user = get_or_create_oauth_user('github', provider_user_id, primary_email, profile_data)
        
        # Save the GitHub access token for this user
        if user and token:
            user.github_token = token
            db.session.commit()
            print(f"✅ Saved GitHub token for user {user.id}")
        
        return user
        
    except Exception as e:
        print(f"GitHub OAuth error: {e}")
        return None
