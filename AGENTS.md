# Commit conventions

Use English Conventional Commits, with a scope where useful.
Keep summaries concise, imperative, and without a trailing period.
Omit co-author trailers and generated-by attribution.
Preserve existing automated release and merge commit formats.

# Release conventions

- Release from `main` through GitHub Actions: [Prepare release](.github/workflows/release.yml)
  handles versioning and tags; [Publish to npm](.github/workflows/publish.yml) handles npm publication.
  Enable `publish_to_npm` for npm releases; do not publish locally.
- Use semantic versions; tags and GitHub release titles are `vX.Y.Z`.
- Write compact English release notes focused on user-visible changes. Include
  only relevant sections, such as Features, Fixes, Performance or Breaking change.
- Name added models without listing exact prices. Distinguish package breaking
  changes from upstream log changes; name the upstream version when confirmed.
- Show release notes for review before publishing unless already approved.
- Verify the Actions result and the published npm version before reporting success.
