# v4 Hybrid Model Testing

## Overview

Testing a hybrid Claude Code approach where:
- **Claude Sonnet 4.6**: Primary model for complex tasks (reasoning, architecture, debugging, code review)
- **DeepSeek Flash v4**: Subagent model for simpler tasks (file reads, edits, routine refactoring)

**Goal**: Reduce Anthropic token usage by ~40-60% by intelligently delegating appropriate work to DeepSeek Flash, while maintaining high code quality for complex decisions.

## Configuration

### Environment Setup

Copy `.env.v4-hybrid` to your active environment:

```bash
cp .env.v4-hybrid .env
```

Key settings:
- `ANTHROPIC_MODEL=claude-sonnet-4-6` — Main model (complex work)
- `CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash` — Delegated model (simple work)
- `DEEPSEEK_HYBRID_API_URL=https://api.deepseek.com/anthropic` — Anthropic-compatible endpoint

### Verification

Check that both models are accessible:

```bash
# Test Claude Sonnet connectivity
curl -s -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages \
  -d '{"model":"claude-sonnet-4-6","max_tokens":100,"messages":[{"role":"user","content":"ping"}]}' | jq .

# Test DeepSeek Flash (Anthropic API)
curl -s -H "Authorization: Bearer $DEEPSEEK_HYBRID_API_KEY" \
  https://api.deepseek.com/anthropic/v1/messages \
  -d '{"model":"deepseek-v4-flash","max_tokens":100,"messages":[{"role":"user","content":"ping"}]}' | jq .
```

## Expected Behavior

### Claude Sonnet Handles:
- Complex bug diagnosis
- Architectural decisions (monorepo setup, state management, API design)
- Security/performance reviews
- Multi-file refactoring with impacts across the codebase
- Test strategy and integration test design
- TypeScript type system questions

### DeepSeek Flash Handles:
- Simple file reads and content summaries
- Straightforward edits (variable rename, import update, formatting)
- Adding simple functions or utilities
- Comment/documentation fixes
- Dependency updates and simple config changes

### Delegation Logic

Claude Code should automatically choose based on task complexity:

```
User: "read this file"
→ DeepSeek Flash (simple, low risk)

User: "fix this performance bottleneck"
→ Claude Sonnet (requires analysis, trade-off reasoning)

User: "update the auth flow to use OAuth"
→ Claude Sonnet (architectural impact, security implications)

User: "rename this variable everywhere"
→ DeepSeek Flash (routine refactoring)
```

## Testing Checklist

### Phase 1: Basic Connectivity
- [ ] Both models respond to simple requests
- [ ] DeepSeek Flash correctly interprets Claude-style function calls
- [ ] API keys and endpoints are properly configured

### Phase 2: Task Delegation
- [ ] Claude Code delegates file reads to Flash
- [ ] Claude Code uses Sonnet for complex analysis
- [ ] Response quality is acceptable for both models
- [ ] No hallucination or format issues from Flash

### Phase 3: Cost/Token Measurement
- [ ] Track token usage per task type
- [ ] Measure average cost per conversation
- [ ] Compare to baseline (Sonnet-only)
- [ ] Target: 40-60% reduction in Anthropic token usage

### Phase 4: Edge Cases
- [ ] Flash handles multi-file context correctly
- [ ] Sonnet escalation works when Flash output is insufficient
- [ ] Error messages are clear when Flash reaches limitations
- [ ] Streaming works properly for both models

## Fallback Strategy

If DeepSeek Flash:
- Fails to parse code correctly → Escalate to Sonnet
- Produces incorrect output → Flag for manual review
- Times out → Retry with Sonnet
- Hallucinates → Sonnet handles similar tasks going forward

## Performance Expectations

### Typical Workflow

```
1. User asks "read src/lib/utils.ts"
   → Flash reads file (instant, <100 tokens)
   → Saves ~50 Sonnet tokens

2. User asks "optimize this sorting"
   → Sonnet analyzes algorithm (expensive, ~500 tokens needed)
   → Uses Sonnet (correct decision)

3. User asks "rename Variable to newName everywhere"
   → Flash does global rename (routine, <50 tokens)
   → Saves ~100+ Sonnet tokens

Per-session savings: 20-40% reduction in Sonnet usage
```

## Notes

- DeepSeek Flash model ID in Anthropic API: `deepseek-v4-flash`
- DeepSeek Anthropic endpoint: `https://api.deepseek.com/anthropic/v1`
- Flash is ~90% cheaper than Sonnet, but lower reasoning capability
- Best for: deterministic, well-structured tasks
- Avoid for: novel architectures, security-critical decisions, ambiguous requirements

## Next Steps

1. Switch to v4-testing branch (already done)
2. Activate .env.v4-hybrid in your shell
3. Run a few test tasks and observe which model handles each
4. Monitor token usage in Claude Code output
5. If successful, integrate hybrid defaults into main branch
