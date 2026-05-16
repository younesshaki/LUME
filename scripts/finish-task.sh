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
REVIEW_LOCK="/tmp/claude-review.lock"

# ---------------------------------------------------------------------------
# 1. Commit
# ---------------------------------------------------------------------------

GIT_STATUS=$(git status --porcelain)

if [[ -z "$GIT_STATUS" ]]; then
  echo "Nothing to commit — working tree is clean."
  exit 0
fi

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
# 3. Claude review — with lock to serialise concurrent agents
# ---------------------------------------------------------------------------

# Wait for any existing lock, then acquire it
LOCK_WAIT=0
while [[ -f "$REVIEW_LOCK" ]]; do
  if (( LOCK_WAIT >= 60 )); then
    echo "WARNING: Review lock held for 60s — proceeding anyway."
    break
  fi
  echo "    Review lock held by another agent — waiting (${LOCK_WAIT}s)..."
  sleep 2
  (( LOCK_WAIT += 2 ))
done

# Create lock; remove it on exit (normal, error, or CTRL-C)
echo $$ > "$REVIEW_LOCK"
trap 'rm -f "$REVIEW_LOCK"' EXIT

echo "==> Running Claude review..."
# Cap review size to prevent token burn on large diffs
DIFF_LINES=$(echo "$DIFF" | wc -l | tr -d ' ')
if (( DIFF_LINES > 500 )); then
  REVIEW=$(echo "$DIFF" | claude -p "Review this git diff concisely (2-4 sentences): what changed, any concerns? Be brief — this is a large diff." --max-tokens 500 2>/dev/null || echo "(Claude review unavailable)")
else
  REVIEW=$(echo "$DIFF" | claude -p "Review this git diff concisely (2-4 sentences): what changed, any concerns?" 2>/dev/null || echo "(Claude review unavailable)")
fi

# Release lock immediately after review
rm -f "$REVIEW_LOCK"
trap - EXIT

echo "--- Review ---"
echo "$REVIEW"
echo "--------------"

# ---------------------------------------------------------------------------
# 4 & 5. JIRA comment + status transition
# ---------------------------------------------------------------------------
if [[ -z "${JIRA_EMAIL:-}" || -z "${JIRA_TOKEN:-}" ]]; then
  echo "WARNING: JIRA_EMAIL or JIRA_TOKEN not set — skipping JIRA steps."
else
  # Read AI Agent field for attribution
  AGENT_VALUE=$(curl -s -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
    "https://hakicsi89.atlassian.net/rest/api/3/issue/${JIRA_ISSUE}?fields=customfield_10104" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fields']['customfield_10104'].get('value','unknown'))" 2>/dev/null || echo "unknown")

  COMMENT_BODY="*Agent:* ${AGENT_VALUE}\n\n*Commit:* ${FULL_MSG}\n\n*Diff summary:*\n{noformat}\n${DIFF_STAT}\n{noformat}\n\n*Code review:*\n${REVIEW}"

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
  # 6. Ask whether Claude approved, then pick the right transition
  # ---------------------------------------------------------------------------
  printf "Did Claude approve this change? [y/N] "
  read -r APPROVED < /dev/tty

  echo "==> Fetching transitions for ${JIRA_ISSUE}..."
  TRANSITIONS=$(curl -s \
    -u "${JIRA_EMAIL}:${JIRA_TOKEN}" \
    -H "Content-Type: application/json" \
    "${JIRA_BASE}/issue/${JIRA_ISSUE}/transitions")

  if [[ "$APPROVED" == "y" || "$APPROVED" == "Y" ]]; then
    # Approved → look for a status whose name contains "claude" (case-insensitive)
    TRANSITION_ID=$(echo "$TRANSITIONS" | jq -r '.transitions[] | select(.name | test("claude"; "i")) | .id' | head -n1)
    TRANSITION_LABEL="Claude"
    FALLBACK_LABEL="In Review"
    FALLBACK_ID=$(echo "$TRANSITIONS" | jq -r '.transitions[] | select(.name | test("In Review"; "i")) | .id' | head -n1)
  else
    # Not approved → move back to In Progress
    TRANSITION_ID=$(echo "$TRANSITIONS" | jq -r '.transitions[] | select(.name | test("In Progress"; "i")) | .id' | head -n1)
    TRANSITION_LABEL="In Progress"
    FALLBACK_LABEL=""
    FALLBACK_ID=""
  fi

  if [[ -z "$TRANSITION_ID" ]]; then
    # Try the fallback if we have one
    if [[ -n "${FALLBACK_ID:-}" ]]; then
      echo "WARNING: '${TRANSITION_LABEL}' transition not found — falling back to '${FALLBACK_LABEL}'."
      TRANSITION_ID="$FALLBACK_ID"
      TRANSITION_LABEL="$FALLBACK_LABEL"
    else
      echo "WARNING: '${TRANSITION_LABEL}' transition not found. Available transitions:"
      echo "$TRANSITIONS" | jq -r '.transitions[].name'
    fi
  fi

  if [[ -n "$TRANSITION_ID" ]]; then
    echo "==> Transitioning ${JIRA_ISSUE} → ${TRANSITION_LABEL} (id: ${TRANSITION_ID})..."
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
