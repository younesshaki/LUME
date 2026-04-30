alter table story_states
add column if not exists analytics jsonb not null default '{
  "sceneDurationsMs": {},
  "currentSceneId": null,
  "currentSceneEnteredAt": null,
  "finalChoicePromptStartedAt": null,
  "finalChoiceResponseMs": null
}';
