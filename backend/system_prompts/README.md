# System Prompt Configuration

This directory contains the system prompt files for your AI Code Generation Chatbot. The system prompt defines how your AI assistant behaves, what it specializes in, and how it responds to different types of queries.

## Files

### `code_generation_prompt.txt`
The main system prompt file that configures your AI to be a specialized code generation assistant called "CodeGenius AI".

**Key Features:**
- Focuses strictly on software development and coding tasks
- Supports full-stack development across multiple technologies
- Provides production-ready code with security best practices
- Gracefully handles non-coding questions by redirecting to coding expertise
- Includes comprehensive technology stack support

## Usage

### Via Web Interface
1. Start your application
2. Log in to the chat interface
3. Click on "System Prompt" in the sidebar
4. Edit the prompt in the configuration modal
5. Save changes (takes effect immediately for new conversations)

### Via API
```bash
# Get current prompt
curl -X GET http://localhost:5000/api/system-prompt

# Update prompt
curl -X POST http://localhost:5000/api/system-prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Your new system prompt here..."}'
```

### Direct File Editing
You can directly edit the `code_generation_prompt.txt` file. The application will load the updated prompt on the next conversation.

## Customization Guidelines

### For Code Generation Focus
- Keep the "CodeGenius AI" identity for consistency
- Maintain the redirect pattern for non-coding questions
- Include specific technology stacks you want to support
- Add any company-specific coding standards or preferences

### For General Purpose
If you want to make the AI more general-purpose, modify the prompt to:
- Remove the strict code-only focus
- Change the identity from "CodeGenius AI" to something more general
- Remove or modify the non-coding question redirect
- Add broader capability descriptions

### Example Customizations

#### Adding New Technologies
```
**SUPPORTED TECHNOLOGIES:**
Frontend: React, Vue.js, Angular, Svelte, Next.js, Nuxt.js, HTML/CSS/JavaScript, Astro
Backend: Node.js, Python (Django/Flask/FastAPI), PHP, Java, C#, Ruby, Go, Rust
Databases: MongoDB, PostgreSQL, MySQL, SQLite, Redis, Firebase, Supabase
DevOps: Docker, Kubernetes, CI/CD, AWS, Azure, GCP, Vercel, Netlify
Mobile: React Native, Flutter, Swift, Kotlin, Ionic
```

#### Company-Specific Standards
```
**CODING STANDARDS:**
- Follow [Your Company] style guide
- Use TypeScript for all new JavaScript projects
- Implement comprehensive error handling
- Include unit tests with Jest/Vitest
- Use ESLint and Prettier for code formatting
- Follow semantic versioning for releases
```

#### Custom Response Templates
```
**PROJECT DELIVERY FORMAT:**
1. **Requirements Analysis** - Understanding and clarification
2. **Architecture Design** - Technology choices and system design
3. **Implementation Plan** - Step-by-step development approach
4. **Code Delivery** - Complete, tested, production-ready code
5. **Documentation** - Setup instructions and API documentation
6. **Deployment Guide** - Production deployment instructions
```

## Best Practices

1. **Be Specific**: Include exact technologies, frameworks, and patterns you want the AI to use
2. **Set Boundaries**: Clearly define what the AI should and shouldn't do
3. **Include Examples**: Provide example responses or code patterns
4. **Regular Updates**: Update the prompt based on your evolving needs
5. **Test Changes**: Test prompt changes with various query types
6. **Backup**: Keep backups of working prompts before making major changes

## Troubleshooting

### AI Not Following Prompt
- Check if the prompt file is properly formatted
- Ensure the backend is loading the correct file
- Restart the application after major prompt changes
- Verify the prompt isn't too long (some models have context limits)

### Inconsistent Responses
- Make the instructions more specific and detailed
- Add examples of desired behavior
- Remove contradictory instructions
- Test with different query types

### Performance Issues
- Keep prompts concise but comprehensive
- Remove unnecessary repetition
- Focus on the most important instructions
- Consider model-specific optimizations

## Security Notes

- System prompts are stored in plain text
- Avoid including sensitive information in prompts
- The prompt configuration API doesn't require authentication (consider adding if needed)
- Backup important prompts before making changes

## Version History

- **v1.0**: Initial CodeGenius AI prompt with full-stack focus
- Add your version history here as you make changes

---

For more information about the chatbot system, see the main README.md file in the project root.
