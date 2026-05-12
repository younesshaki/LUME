# Aider + Deepseek Setup Guide for Youness

## What is Aider?

Aider is an AI-powered coding assistant that runs in your terminal. It understands your codebase and can:
- Answer questions about your code
- Generate new code
- Modify existing files
- Create tests
- Commit changes to git

You're using it with **Deepseek** as the AI model (instead of Claude or ChatGPT).

---

## Installation

Already done! Aider is installed in your Python environment at:
```
/Users/younesshaki/Library/Python/3.9/bin/aider
```

And Python bin is added to PATH, so you can use `aider` directly from any terminal.

---

## Quick Start

### 1. Set Your API Key

You have two options:

**Option A: Use environment variable (recommended, cleaner)**
```bash
export DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
```

Add this to your `~/.zshrc` so it persists:
```bash
echo 'export DEEPSEEK_API_KEY="<DEEPSEEK_API_KEY>"' >> ~/.zshrc
source ~/.zshrc
```

**Option B: Pass it on the command line**
```bash
aider --api-key deepseek=<DEEPSEEK_API_KEY> --model deepseek/deepseek-chat
```

### 2. Start Aider

Navigate to LUME and launch:

```bash
cd /Users/younesshaki/Documents/LUME
aider --model deepseek/deepseek-chat
```

(If you set the env var above, the `--api-key` flag is automatic)

### 3. You're In

You'll see:
```
Aider v0.82.3
Model: deepseek/deepseek-chat with diff edit format
Git repo: .git with 428 files
Repo-map: using 4096 tokens, auto refresh

>
```

Type anything and ask Aider questions or give it instructions.

---

## Adding Files to the Chat

Aider needs to know which files to read from. You don't add them once and forget — you manage them per session.

### Option 1: Add directories (easiest)

Type in the chat:
```
/add src/components/chat/
/add src/lib/
```

This loads ALL files in those folders so Aider can reference them.

### Option 2: Add specific files

```
/add src/components/chat/OllamaChat.state.ts
/add src/lib/deepseekService.ts
```

### Option 3: Start with files pre-loaded

Exit Aider and restart with:
```bash
aider src/components/chat/ src/lib/ src/app-shell/ --model deepseek/deepseek-chat
```

### Option 4: Create a config file (best for workflow)

In LUME root, create `.aider.conf.json`:

```json
{
  "files": [
    "src/components/chat/",
    "src/lib/",
    "src/app-shell/",
    "src/experience/"
  ]
}
```

Then start with:
```bash
aider --load .aider.conf.json --model deepseek/deepseek-chat
```

**Recommendation:** Use Option 4 with a config file. Add it once, reuse every session.

---

## Common Commands in Aider

### Ask about code
```
> What does loadVehicles() do?
> Explain the authentication flow
> How does the Dock component work?
```

### Create new files
```
> /add src/lib/deepseekService.ts
> Create a function that calls the Deepseek API for streaming chat
```

### Modify existing code
```
> Update OllamaChat.state.ts to use Deepseek instead of Ollama
> Add error handling to the authentication service
```

### View files
```
> /read src/components/chat/OllamaChat.state.ts
```

### List added files
```
> /ls
```

### Remove files from chat
```
> /drop src/components/chat/OllamaChat.state.ts
```

### Commit changes
```
> /commit
```

Or let Aider auto-commit after edits (ask it first).

### Show git diff
```
> /diff
```

---

## Workflow Example: Replace Ollama with Deepseek

1. **Start Aider with the relevant files:**
```bash
aider --load .aider.conf.json --model deepseek/deepseek-chat
```

2. **Add the files you want to modify:**
```
/add src/components/chat/
/add src/lib/
```

3. **Ask Aider to create the service:**
```
Create src/lib/deepseekService.ts that:
- Calls the Deepseek API for chat inference
- Supports streaming responses
- Handles errors gracefully
- Exports a function called callDeepseekChat(prompt, options)
```

4. **Then ask it to update OllamaChat:**
```
Update src/components/chat/OllamaChat.state.ts to use deepseekService instead of Ollama.
Keep the same interface so no other files need to change.
```

5. **Review the changes:**
```
/diff
```

6. **Commit:**
```
/commit
```

Aider will create a git commit with your changes automatically.

---

## Tips & Tricks

### 1. Context Window
Aider has limited context (around 8k tokens for smaller models). If you add too many files, it might forget earlier context. Keep added files focused on the task.

### 2. Streaming
Aider shows Deepseek's response in real-time. You'll see it typing out the answer.

### 3. Auto-commits
After each edit, Aider can auto-commit to git. This keeps history clean:
```
> /commit-off  (to disable)
> /commit-on   (to enable)
```

### 4. Drafts Before Commits
Ask Aider to show diffs before committing:
```
> /diff
```

Review, then:
```
> /commit
```

### 5. File Exclusion
If Aider tries to edit files you don't want touched, create `.aiderignore`:

```
node_modules/
public/
dist/
*.test.ts
*.css
vercel.json
```

Then Aider avoids those files.

### 6. Cost Tracking
Each message shows token usage and cost:
```
Tokens: 4.2k sent, 1.5k received. Cost: $0.0015 message, $0.0042 session.
```

Watch this to avoid expensive queries (asking Aider to read your entire codebase).

---

## For LUME Specifically

### Pre-load the Core Chat Files

Create `.aider.conf.json` at LUME root:

```json
{
  "files": [
    "src/components/chat/OllamaChat.state.ts",
    "src/components/chat/OllamaChat.types.ts",
    "src/lib/eventsService.ts",
    "src/lib/supabase.ts",
    "src/experience/vehicles/catalog.ts"
  ]
}
```

Then start with:
```bash
aider --load .aider.conf.json --model deepseek/deepseek-chat
```

### Common Tasks

**Replace Ollama with Deepseek:**
```
Create src/lib/deepseekService.ts for calling Deepseek API.
Then update OllamaChat.state.ts to use it instead of Ollama.
```

**Add RAG to the bot:**
```
/add src/experience/vehicles/catalog.ts
Create a function that:
1. Loads vehicle data
2. Finds relevant vehicles based on user query
3. Formats them as context for Deepseek
```

**Explain a complex file:**
```
/read src/experience/vehicles/catalog.ts
Explain how CSV parsing works in this file. Use simple language.
```

---

## Troubleshooting

### "command not found: aider"
PATH wasn't updated. Run:
```bash
source ~/.zshrc
```

Or reinstall:
```bash
python3 -m pip install --upgrade aider-chat
```

### "API key error"
Make sure your Deepseek key is set:
```bash
echo $DEEPSEEK_API_KEY
```

Should print your key. If empty:
```bash
export DEEPSEEK_API_KEY=<DEEPSEEK_API_KEY>
```

### "Too many tokens"
You added too many files. Remove some:
```
/drop src/components/
```

Or start fresh:
```bash
exit  # Exit Aider
aider --model deepseek/deepseek-chat  # Restart with no files
```

### Aider modified the wrong file
This happens sometimes. Check with `/diff` before `/commit`:
```
/diff
```

If it looks wrong, don't commit. Ask Aider to fix it:
```
You modified the wrong file. Revert that change and only update X instead.
```

---

## API Costs

Deepseek is **very cheap** (~$0.14 per million tokens). A typical session costs $0.01-0.05.

Watch the token counter:
```
Tokens: 4.2k sent, 1.5k received. Cost: $0.0015
```

If a single message costs more than $0.01, you probably added too many files.

---

## Next Steps

1. **Test it**: Ask Aider a simple question about your code
2. **Create config file**: Save `.aider.conf.json` with your common files
3. **Integrate Deepseek**: Use Aider to build the Deepseek service for OllamaChat
4. **Let it modify code**: Don't be afraid — Aider commits to git, you can always revert

---

## Resources

- **Aider docs**: https://aider.chat/
- **Deepseek docs**: https://platform.deepseek.com/
- **Your API key**: Already set (<DEEPSEEK_API_KEY>)

Good luck!
