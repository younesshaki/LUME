#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# finish-task.sh  —  commit → review → JIRA comment → transition → shared log
# Usage: ./scripts/finish-task.sh SCRUM-86 "commit message"
# ---------------------------------------------------------------------------

JIRA_ISSUE="${1:-}"
COMMIT_MSG="${2:-}"

if [[ -z "$JIRA_ISSUE" || -z "$COMMIT_MSG" ]]; then
  echo "Usage: $0 <JIRA_ISSUE> <commit message>"
  exit 1
fi

FULL_MSG="${JIRA_ISSUE}: ${COMMIT_MSG}"
JIRA_BASE="https://hakicsi89.atlassian.net/rest/api/3"
SHARED_LOG="/Users/younesshaki/Documents/first/agents/shared-log.md"

# ---------------------------------------------------------------------------
# 1. Commit
# ---------------------------------------------------------------------------

# Safety guard: check for nothing to commit
GIT_STATUS=$(git status --porcelain)

if [[ -z "$GIT_STATUS" ]]; then
  echo "Nothing to commit — working tree is clean."
  exit 0
fi

# Safety guard: warn about untracked files and ask for confirmation
UNTRACKED=$(echo "$GIT_STATUS" | grep '^??' || true)
if [[ -n "$UNTRACKED" ]]; then
  echo "WARNING: The following untracked files will be staged:"
  echo "$UNTRACKED" | sed 's/^?? /  /'
  printf "Proceed and stage all files? [y/N] "
  read -r CONFIRM < /dev/tty
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Staging all changes..."
git add -A

if git diff --cached --quiet; then
  echo "    Nothing to commit — using last commit diff for review."
else
  echo "==> Committing: $FULL_MSG"
  git commit -m "$FULL_MSG"
fi

# ---------------------------------------------------------------------------
# 2. Get diff of the last commit
# ---------------------------------------------------------------------------
echo "==> Getting last commit diff..."
DIFF=$(git diff HEAD~1 HEAD 2>/dev/null || git show --stat HEAD)
DIFF_STAT=$(git diff --stat HEAD~1 HEAD 2>/dev/null || git show --stat HEAD | tail -n3)

echo "$DIFF_STAT"

# ---------------------------------------------------------------------------
# 3. Claude review
# ---------------------------------------------------------------------------
echo "==> Running Claude review..."
REVIEW=$(echo "$DIFF" | claude -p "Review this git diff concisely (2-4 sentences): what changed, any concerns?" 2>/dev/null || echo "(Claude review unavailable)")

echo "--- Review ---"
echo "$REVIEW"
echo "--------------"

# ---------------------------------------------------------------------------
# 4 & 5. JIRA comment
# ---------------------------------------------------------------------------
if [[ -z "${JIRA_EMAIL:-}" || -z "${JIRA_TOKEN:-}" ]]; then
  echo "WARNING: JIRA_EMAIL or JIRA_TOKEN not set — skipping JIRA steps."
else
  COMMENT_BODY="*Commit:* ${FULL_MSG}

*Diff summary:*
{noformat}
${DIFF_STAT}
{noformat}

*Code review:*
${REVIEW}"

  # Escape for JSON
  COMMENT_JSON=$(jq -n --arg body "$COMMENT_BODY" '{
    body: {
      version: 1,
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: $body }]
      }]
    }
  }')

  echo "==> Posting JIRA comment to ${JIRA_ISSUE}..."
  curl -s -o /dev/null -w "    HTTP %{http_code}\n" \
    -X POST \
    -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$COMMENT_JSON" \
    "${JIRA_BASE}/issue/${JIRA_ISSUE}/comment"

  # ---------------------------------------------------------------------------
  # 6. Transition to "In Review"
  # ---------------------------------------------------------------------------
  echo "==> Fetching transitions for ${JIRA_ISSUE}..."
  TRANSITIONS=$(curl -s \
    -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
    -H "Content-Type: application/json" \
    "${JIRA_BASE}/issue/${JIRA_ISSUE}/transitions")

  TRANSITION_ID=$(echo "$TRANSITIONS" | jq -r '.transitions[] | select(.name | test("In Review"; "i")) | .id' | head -n1)

  if [[ -z "$TRANSITION_ID" ]]; then
    echo "WARNING: 'In Review' transition not found. Available transitions:"
    echo "$TRANSITIONS" | jq -r '.transitions[].name'
  else
    echo "==> Transitioning ${JIRA_ISSUE} → In Review (id: ${TRANSITION_ID})..."
    curl -s -o /dev/null -w "    HTTP %{http_code}\n" \
      -X POST \
      -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"transition\":{\"id\":\"${TRANSITION_ID}\"}}" \
      "${JIRA_BASE}/issue/${JIRA_ISSUE}/transitions"
  fi
fi

# ---------------------------------------------------------------------------
# 7. Append to shared log
# ---------------------------------------------------------------------------
if [[ -f "$SHARED_LOG" ]]; then
  TIMESTAMP=$(date -u "+%Y-%m-%d %H:%M UTC")
  printf '\n## %s — %s\n%s\n' "$JIRA_ISSUE" "$TIMESTAMP" "$COMMIT_MSG" >> "$SHARED_LOG"
  echo "==> Appended to shared log."
else
  echo "INFO: Shared log not found at $SHARED_LOG — skipping."
fi

echo "==> Done."
