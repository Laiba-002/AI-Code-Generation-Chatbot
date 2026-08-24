# AI Code Generation Chatbot

A modern, full-stack AI chatbot application with Claude-like interface, built with React frontend and Flask backend, supporting multiple offline Ollama models with advanced code generation and artifact management capabilities.

## 🚀 Features

### Core Chat Features
- 🎨 **Modern UI**: Dark theme interface similar to Claude with responsive design
- 🤖 **Multiple Models**: Support for various Ollama models (qwen2.5:8b, llama3.2:3b, codellama:8b, etc.)
- 💬 **Real-time Chat**: WebSocket-based streaming responses with chunk-based rendering
- 🔄 **Model Selection**: Dynamic model switching in chat interface
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🚀 **Offline Capable**: All models run locally via Ollama

### Advanced Code Features
- 🔍 **Chunk-Based Rendering**: Intelligent content rendering based on metadata
- 💻 **Code Artifacts**: Create, manage, and preview code snippets as artifacts
- 🌐 **Live Preview**: Execute HTML/CSS/JavaScript code in sandboxed iframes
- 📋 **Copy & Download**: One-click code copying and artifact downloading
- 🎯 **Smart Detection**: Automatic detection of code blocks, languages, and content types

### Artifact Management
- 📦 **Artifact Creation**: Convert code blocks into reusable artifacts
- 🗂️ **Artifact Library**: Browse and manage all created artifacts
- 🔍 **Artifact Preview**: Live preview for executable artifacts (HTML, SVG)
- 📥 **Download Support**: Download artifacts with appropriate file extensions
- 🏷️ **Metadata Tracking**: Track language, type, and creation information

### Debugging & Development
- 🐛 **Debug Panel**: Real-time chunk monitoring and metadata inspection
- 📊 **Chunk Analytics**: View content types, languages, and streaming data
- 🔧 **V1/V2 Handler Toggle**: Switch between standard and metadata-enhanced handlers
- 📝 **Console Logging**: Detailed logging for development and troubleshooting

### Authentication & Sessions
- 🔐 **Complete Auth System**: User registration, login, and session management
- 💾 **Chat History**: Persistent chat sessions with database storage
- 👤 **User Profiles**: User management and profile customization
- 🔒 **Secure Sessions**: Password hashing and secure session handling

## 🛠️ Tech Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for modern styling
- Socket.io-client for real-time communication
- React Router for navigation
- Lucide React for icons

### Backend
- Flask (Python) with Flask-SocketIO
- SQLAlchemy for database management
- Ollama Python client for AI model integration
- Redis (optional) for artifact storage
- CORS support for cross-origin requests

## 📋 Prerequisites

- Node.js (v16 or higher)
- Python (v3.8 or higher)
- Ollama installed and running locally
- Git
- Redis (optional, for enhanced artifact storage)

## 🚀 Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd AI-Code-Generation-Chatbot
```

### 2. Install Ollama Models
```bash
# Install the required models
ollama pull qwen2.5-coder:7b
ollama pull llama3.2:3b
ollama pull codellama:7b
ollama pull mistral:7b
ollama pull qwen3:8b
```

### 3. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python init_db.py  # Initialize database and create demo user
python app.py
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm start
```

## 🔐 Authentication

The application includes a complete authentication system:

### Demo Account
- Email: abdul@example.com
- Password: password123

### Features
- User registration with email validation
- Secure login with password hashing
- Session management with persistence
- Chat history and session tracking
- User profile management

### Registration Requirements
- Email must be valid format
- Username: 3-20 characters, letters/numbers/underscores only
- Password: Minimum 8 characters with uppercase, lowercase, and number

## 🎯 Usage

### Basic Chat
1. Start the backend server (runs on http://localhost:5000)
2. Start the frontend development server (runs on http://localhost:3000)
3. Open your browser and navigate to http://localhost:3000
4. Select your preferred model from the dropdown
5. Start chatting!

### Code Generation & Artifacts
1. Ask the AI to generate code (e.g., "Create a responsive digital clock")
2. The system automatically detects code content and renders it with special formatting
3. Use the Copy button to copy code to clipboard
4. Click Create Artifact to save code as a reusable artifact
5. Click Preview to see live execution of HTML/CSS/JavaScript code
6. Navigate to Artifacts in the sidebar to manage all created artifacts

### Debugging
1. Click "Show Debug" in the top bar to enable the debug panel
2. Send messages to see real-time chunk data and metadata
3. Monitor content types, languages, and streaming information
4. Use the debug panel to troubleshoot rendering issues

## 🤖 Available Models

- **qwen2.5-coder:7b**: Good balance of code, performance and speed
- **llama3.2:3b**: Fast and lightweight
- **codellama:7b**: Specialized for code generation
- **mistral:7b**: Excellent general-purpose model
- **qwen3:8b**: For best and optimal code generation

## 📁 Project Structure

```
AI-Code-Generation-Chatbot/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── artifacts.py           # Artifact management system
│   ├── auth.py               # Authentication system
│   ├── models.py             # Database models
│   ├── requirements.txt      # Python dependencies
│   └── test_artifacts_api.py # API testing script
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ContentRenderer.tsx    # Smart content rendering
│   │   │   ├── ArtifactList.tsx       # Artifact management UI
│   │   │   ├── DebugPanel.tsx         # Debug monitoring
│   │   │   └── ...                   # Other components
│   │   ├── hooks/
│   │   │   └── useChat.ts            # Chat logic with V2 support
│   │   ├── services/
│   │   │   └── authService.ts        # Authentication service
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript definitions
│   │   └── utils/
│   │       └── socket.ts             # WebSocket communication
│   ├── package.json
│   └── tailwind.config.js
├── ARTIFACTS_FEATURES.md     # Detailed artifact documentation
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### Chat Sessions
- `GET /api/sessions` - Get user's chat sessions
- `POST /api/sessions` - Create new chat session
- `GET /api/sessions/<id>/messages` - Get session messages
- `DELETE /api/sessions/<id>` - Delete chat session

### Artifacts
- `GET /api/artifacts/health` - Health check
- `GET /api/artifacts/types` - Get supported artifact types
- `POST /api/artifacts` - Create new artifact
- `GET /api/artifacts/{id}` - Get artifact by ID
- `PUT /api/artifacts/{id}` - Update artifact
- `DELETE /api/artifacts/{id}` - Delete artifact
- `GET /api/artifacts/{id}/preview` - Preview executable artifacts
- `GET /api/artifacts/{id}/download` - Download artifact as file

### AI Models
- `GET /api/models` - Get available models
- `POST /api/chat` - Send chat message
- `WebSocket /socket.io` - Real-time chat streaming with V2 metadata

## 🎨 Content Types Supported

### Artifact Types
- **HTML** (text/html): Interactive HTML with CSS and JavaScript
- **Code** (application/vnd.ant.code): Code snippets in various languages
- **React** (application/vnd.ant.react): React components with JSX
- **Markdown** (text/markdown): Formatted text documents
- **SVG** (image/svg+xml): Scalable Vector Graphics
- **Mermaid** (application/vnd.ant.mermaid): Flow charts and diagrams
- **JSON** (application/json): Structured data

### Languages Detected
- HTML, CSS, JavaScript
- Python, Java, C++, C
- PHP, Ruby, Go, Rust
- TypeScript, JSX, TSX
- And many more...

## 🐛 Debugging Features

### Debug Panel
- Real-time chunk monitoring
- Content type detection
- Metadata inspection
- Streaming analytics
- Performance metrics

### Console Logging
- Chunk reception logs (🔍 V2 Chunk Received)
- Streaming content logs (📝 Streaming Content)
- Final response logs (✅ Final Response Complete)
- Content rendering logs (🎨 ContentRenderer Processing)

### V2 Handler Features
- Metadata-enhanced streaming
- Content type detection
- Language identification
- Executable code detection
- Syntax highlighting support

## 🔧 Configuration

### Environment Variables
```bash
# Redis configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Artifact storage settings
ARTIFACT_EXPIRY_HOURS=24

# Database configuration
DATABASE_URL=sqlite:///chatbot.db
```

### Model Configuration
Models can be configured in the backend to support different Ollama models and their specific parameters.

## 🧪 Testing

### API Testing
```bash
cd backend
python test_artifacts_api.py
```

### Manual Testing
1. Enable debug panel
2. Send various types of content (text, code, HTML)
3. Test artifact creation and preview
4. Verify chunk-based rendering

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use Tailwind CSS for styling
- Implement proper error handling
- Add comprehensive logging
- Test with multiple Ollama models

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Ollama for providing the local AI model infrastructure
- Claude for inspiring the UI design
- React and Flask communities for excellent documentation
- Tailwind CSS for the utility-first CSS framework

## 📞 Support

For support and questions:

- Open an issue on GitHub
- Check the debug panel for troubleshooting
- Review the ARTIFACTS_FEATURES.md for detailed documentation
- Test with the provided demo account

Happy coding! 🚀
