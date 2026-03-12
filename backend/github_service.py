"""
GitHub Integration Service
Handles GitHub OAuth authentication, repository browsing, and file fetching
"""

import os
import requests
import base64
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime
from flask import session, current_app
from models import db, User
from github import Github, GithubException
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

class GitHubService:
    def __init__(self):
        self.client_id = os.getenv('GITHUB_CLIENT_ID')
        self.client_secret = os.getenv('GITHUB_CLIENT_SECRET')
        self.redirect_uri = os.getenv('GITHUB_REDIRECT_URI', 'http://localhost:5000/api/auth/github/callback')
        
        if not self.client_id or not self.client_secret:
            logger.warning("GitHub OAuth credentials not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.")

    def get_authorization_url(self, state: str = None) -> str:
        """Generate GitHub OAuth authorization URL"""
        if not self.client_id:
            raise ValueError("GitHub OAuth not configured")
        
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'scope': 'repo,user:email',
            'state': state or 'github_auth'
        }
        
        return f"https://github.com/login/oauth/authorize?{urlencode(params)}"

    def exchange_code_for_token(self, code: str) -> Optional[str]:
        """Exchange authorization code for access token"""
        try:
            response = requests.post('https://github.com/login/oauth/access_token', {
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'code': code,
                'redirect_uri': self.redirect_uri
            }, headers={'Accept': 'application/json'})
            
            if response.status_code == 200:
                data = response.json()
                return data.get('access_token')
            else:
                logger.error(f"Failed to exchange code for token: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error exchanging code for token: {e}")
            return None

    def get_user_info(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Get GitHub user information"""
        try:
            github = Github(access_token)
            user = github.get_user()
            
            return {
                'id': user.id,
                'login': user.login,
                'name': user.name or user.login,
                'email': user.email,
                'avatar_url': user.avatar_url,
                'html_url': user.html_url
            }
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting user info: {e}")
            return None

    def get_user_repositories(self, access_token: str, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        """Get user's repositories"""
        try:
            github = Github(access_token)
            user = github.get_user()
            
            # Get both owned and collaborated repositories
            repos = user.get_repos(
                type='all',  # all, owner, member
                sort='updated',
                direction='desc'
            )
            
            repo_list = []
            for i, repo in enumerate(repos):
                if i >= (page - 1) * per_page and len(repo_list) < per_page:
                    repo_data = {
                        'id': repo.id,
                        'name': repo.name,
                        'full_name': repo.full_name,
                        'description': repo.description,
                        'html_url': repo.html_url,
                        'clone_url': repo.clone_url,
                        'language': repo.language,
                        'stars': repo.stargazers_count,
                        'forks': repo.forks_count,
                        'updated_at': repo.updated_at.isoformat() if repo.updated_at else None,
                        'private': repo.private,
                        'owner': {
                            'login': repo.owner.login,
                            'avatar_url': repo.owner.avatar_url
                        }
                    }
                    repo_list.append(repo_data)
                elif len(repo_list) >= per_page:
                    break
            
            return repo_list
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return []
        except Exception as e:
            logger.error(f"Error getting repositories: {e}")
            return []

    def get_repository_contents(self, access_token: str, repo_full_name: str, path: str = "") -> List[Dict[str, Any]]:
        """Get repository contents (files and directories)"""
        try:
            github = Github(access_token)
            repo = github.get_repo(repo_full_name)
            contents = repo.get_contents(path)
            
            if not isinstance(contents, list):
                contents = [contents]
            
            items = []
            for item in contents:
                item_data = {
                    'name': item.name,
                    'path': item.path,
                    'type': item.type,  # 'file' or 'dir'
                    'size': item.size,
                    'sha': item.sha,
                    'download_url': item.download_url,
                    'html_url': item.html_url
                }
                items.append(item_data)
            
            # Sort: directories first, then files
            items.sort(key=lambda x: (x['type'] != 'dir', x['name'].lower()))
            return items
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return []
        except Exception as e:
            logger.error(f"Error getting repository contents: {e}")
            return []

    def get_file_content(self, access_token: str, repo_full_name: str, file_path: str) -> Optional[Dict[str, Any]]:
        """Get file content from repository"""
        try:
            github = Github(access_token)
            repo = github.get_repo(repo_full_name)
            file_content = repo.get_contents(file_path)
            
            if file_content.type != 'file':
                return None
            
            # Decode base64 content
            content = base64.b64decode(file_content.content).decode('utf-8', errors='ignore')
            
            return {
                'name': file_content.name,
                'path': file_content.path,
                'content': content,
                'size': file_content.size,
                'sha': file_content.sha,
                'encoding': file_content.encoding,
                'download_url': file_content.download_url,
                'html_url': file_content.html_url
            }
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting file content: {e}")
            return None

    def search_repositories(self, access_token: str, query: str, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        """Search repositories within user's own repositories"""
        try:
            github = Github(access_token)
            user = github.get_user()
            
            # Get user's repositories and filter by search query
            all_repos = user.get_repos(
                type='all',  # all, owner, member
                sort='updated',
                direction='desc'
            )
            
            # Filter repositories by search query (case-insensitive)
            query_lower = query.lower()
            filtered_repos = []
            
            for repo in all_repos:
                # Search in repository name, description, and language
                if (query_lower in repo.name.lower() or 
                    (repo.description and query_lower in repo.description.lower()) or
                    (repo.language and query_lower in repo.language.lower())):
                    filtered_repos.append(repo)
            
            # Apply pagination
            repo_list = []
            start_index = (page - 1) * per_page
            end_index = start_index + per_page
            
            for repo in filtered_repos[start_index:end_index]:
                repo_data = {
                    'id': repo.id,
                    'name': repo.name,
                    'full_name': repo.full_name,
                    'description': repo.description,
                    'html_url': repo.html_url,
                    'clone_url': repo.clone_url,
                    'language': repo.language,
                    'stars': repo.stargazers_count,
                    'forks': repo.forks_count,
                    'updated_at': repo.updated_at.isoformat() if repo.updated_at else None,
                    'private': repo.private,
                    'owner': {
                        'login': repo.owner.login,
                        'avatar_url': repo.owner.avatar_url
                    }
                }
                repo_list.append(repo_data)
            
            return repo_list
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return []
        except Exception as e:
            logger.error(f"Error searching repositories: {e}")
            return []

    def get_repository_tree(self, access_token: str, repo_full_name: str, max_depth: int = 3) -> Dict[str, Any]:
        """Get repository file tree structure"""
        try:
            github = Github(access_token)
            repo = github.get_repo(repo_full_name)
            
            def build_tree(path: str = "", depth: int = 0) -> Dict[str, Any]:
                if depth >= max_depth:
                    return {}
                
                try:
                    contents = repo.get_contents(path)
                    if not isinstance(contents, list):
                        contents = [contents]
                    
                    tree = {}
                    for item in contents:
                        if item.type == 'dir':
                            tree[item.name] = {
                                'type': 'directory',
                                'path': item.path,
                                'children': build_tree(item.path, depth + 1) if depth < max_depth - 1 else {}
                            }
                        else:
                            tree[item.name] = {
                                'type': 'file',
                                'path': item.path,
                                'size': item.size,
                                'download_url': item.download_url
                            }
                    
                    return tree
                except:
                    return {}
            
            return {
                'repository': {
                    'name': repo.name,
                    'full_name': repo.full_name,
                    'description': repo.description
                },
                'tree': build_tree()
            }
            
        except GithubException as e:
            logger.error(f"GitHub API error: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error getting repository tree: {e}")
            return {}

    def store_user_token(self, user_id: int, access_token: str):
        """Store GitHub access token for user (in production, encrypt this)"""
        try:
            user = User.query.get(user_id)
            if user:
                # In production, you should encrypt the token
                user.github_token = access_token
                db.session.commit()
                logger.info(f"Stored GitHub token for user {user_id}")
        except Exception as e:
            logger.error(f"Error storing GitHub token: {e}")

    def get_user_token(self, user_id: int) -> Optional[str]:
        """Get stored GitHub access token for user"""
        try:
            user = User.query.get(user_id)
            return user.github_token if user else None
        except Exception as e:
            logger.error(f"Error getting GitHub token: {e}")
            return None

# Global instance
github_service = GitHubService()
