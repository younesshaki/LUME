# How Git Works

Git is a distributed version control system that tracks changes to files over time. It's the most widely used tool for source code management in software development.

## Core Concepts

1. **Repository**: A Git repository (repo) is a directory that contains all the files and the entire history of the project. It's stored locally in the `.git` folder.

2. **Commits**: A commit is a snapshot of the project at a specific point in time. Each commit has a unique hash (SHA-1), a message describing the change, and metadata (author, timestamp).

3. **Branches**: A branch is a lightweight, movable pointer to a specific commit. The default branch is usually `main` (previously `master`). Branches let you work on features in isolation.

4. **Working Directory, Staging Area, Repository**: The three-tree architecture. The working directory is where you edit files. The staging area (index) is where you prepare changes for a commit. The repository (.git directory) stores committed snapshots.

5. **Merging**: Combining changes from different branches. Git automatically merges changes when possible; conflicts arise when two branches modify the same part of a file.

6. **Remote Repositories**: Git is distributed — every clone has the full history. Remotes (like GitHub, GitLab) facilitate collaboration via `push`, `pull`, and `fetch`.

7. **The Git Workflow**: edit → stage (`git add`) → commit (`git commit`) → push (`git push`) → collaborate (pull requests, merge).

## Key Commands

- `git init` — create a new repository
- `git add <file>` — stage changes
- `git commit -m "message"` — commit staged changes
- `git branch <name>` — create a branch
- `git checkout <branch>` — switch branches
- `git merge <branch>` — merge a branch
- `git push` — send commits to remote
- `git pull` — fetch and merge from remote
- `git log` — view commit history
- `git status` — view current state
