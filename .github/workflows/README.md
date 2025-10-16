# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the translate-react project.

> [!NOTE]
> **Quick Start**: See [GitHub Actions Setup Guide](../../docs/GITHUB_ACTIONS_SETUP.md) for configuration instructions.

## Workflows

### 1. CI Workflow (`ci.yml`)

**Triggers:**

- Push to `main` or `dev` branches
- Pull requests to `main` or `dev` branches

**Jobs:**

- **Lint and Type Check**: Runs ESLint, Prettier formatting check, and TypeScript type checking
- **Test**: Runs the test suite using Bun

**Features:**

- Automatic cancellation of outdated runs for the same PR/branch
- Cached dependencies for faster builds
- Runs in parallel for faster feedback

---

### 2. Sync and Translate Workflow (`sync-and-translate.yml`)

**Triggers:**

- Manual dispatch (via GitHub UI)
- Scheduled runs (every 6 hours) to check for upstream changes
- Repository dispatch events (webhook from upstream)

**Jobs:**

1. **Check Upstream Changes**: Detects if the upstream repository has new commits
2. **Sync and Translate**: Syncs fork with upstream and runs the translation workflow

**Features:**

- **SQLite State Persistence**: Uses GitHub Actions cache to maintain the translation database between runs
- **Automatic Upstream Sync**: Keeps your fork up-to-date with the upstream repository
- **Artifact Uploads**: Saves database snapshots and logs for debugging
- **Timeout Protection**: 2-hour timeout to prevent runaway workflows
- **Concurrency Control**: Only one translation workflow runs at a time

### 3. Database Management Workflow (`database-management.yml`)

**Triggers:**

- Manual dispatch only (via GitHub UI)

**Actions:**

- **Backup**: Create a manual backup of the database
- **Restore**: Restore database from a previous run's artifact
- **Clean**: Remove old snapshots (keeps last 10 by default)
- **Inspect**: Generate database statistics report

**Features:**

- Uses npm scripts (`db:validate`, `db:clean`, `db:inspect`, `db:size`) for all operations
- Validates database integrity before restore
- Automatic backup before cleanup operations
- Generates human-readable reports

---

## Setup Instructions

For detailed setup instructions, see [GitHub Actions Setup Guide](../../docs/GITHUB_ACTIONS_SETUP.md).

**Quick reference** - Configure in repository settings:

**Secrets** (Settings → Secrets and variables → Actions → Repository secrets):
- `WORKFLOW_GITHUB_TOKEN` - GitHub PAT with `repo` scope
- `OPENAI_API_KEY` - LLM service API key

**Variables** (Settings → Secrets and variables → Actions → Variables):
- `REPO_FORK_OWNER`, `REPO_FORK_NAME` - Your fork details
- `REPO_UPSTREAM_OWNER`, `REPO_UPSTREAM_NAME` - Upstream repository
- `TARGET_LANGUAGE` - Translation target (e.g., `pt-BR`)
- `TRANSLATION_BASE_PATH` - Path to translate (default: `src/content`)

---

## SQLite State Persistence Strategy

### Problem

The translation workflow uses SQLite to:

- Cache language detection results
- Track processed files and their status
- Store translation snapshots
- Prevent duplicate work

GitHub Actions runners are ephemeral, so the database would be lost between runs.

### Solution

We use a **two-tier persistence strategy**:

#### 1. **GitHub Actions Cache** (Primary)

```yaml
- name: Restore SQLite cache
  uses: actions/cache/restore@v4
  with:
    path: |
      snapshots.sqlite
      snapshots.sqlite-journal
    key: sqlite-cache-${{ github.repository }}-${{ github.run_id }}
    restore-keys: |
      sqlite-cache-${{ github.repository }}-
```

- **Pros**: Fast, automatic, no manual intervention
- **Cons**: 10 GB total cache limit, 7-day retention for unused caches
- **Usage**: Primary state persistence between workflow runs

#### 2. **Artifacts** (Backup/Recovery)

```yaml
- name: Upload database artifact
  uses: actions/upload-artifact@v4
  with:
    name: translation-database-${{ github.run_id }}
    path: snapshots.sqlite
    retention-days: 30
```

- **Pros**: Longer retention (30 days), downloadable for debugging
- **Cons**: Manual recovery required
- **Usage**: Debugging, audit trail, disaster recovery

### Cache Key Strategy

The cache uses a hierarchical key structure:

- **Primary Key**: `sqlite-cache-{repo}-{run_id}` (unique per run)
- **Restore Keys**: `sqlite-cache-{repo}-` (matches latest from any run)

This ensures:

- Each run saves its state under a unique key
- Future runs restore from the most recent successful run
- Cache pruning happens automatically based on GitHub's LRU policy

### Recovery Process

If the cache is lost or corrupted:

1. Download the database artifact from a previous successful run
2. Place it in the repository root as `snapshots.sqlite`
3. Commit and push, or manually upload via Actions UI
4. The next workflow run will pick it up

---

## Monitoring and Debugging

### View Workflow Runs

Navigate to **Actions** tab in your GitHub repository to see all workflow runs.

### Download Artifacts

Each translation run uploads two artifacts:

- **Database**: `translation-database-{run_id}` (30-day retention)
- **Logs**: `translation-logs-{run_id}` (7-day retention)

### Check Database State

Download the database artifact and inspect it locally using the database management npm scripts:

```bash
# Download and extract artifact
unzip translation-database-*.zip

# Inspect database (human-readable)
bun run db:inspect

# Inspect database (JSON output)
bun run db:inspect -- --json

# Check file size
bun run db:size

# Validate integrity
bun run db:validate

# Clean old snapshots (keep last 5)
bun run db:clean -- --keep 5
```

The database management scripts (`db:validate`, `db:clean`, `db:inspect`, `db:size`) provide reusable operations used by both workflows and local development.

---

## Upstream Webhook Setup (Optional)

To trigger translations immediately when upstream pushes (instead of waiting for scheduled checks):

1. Go to the **upstream repository** (you need admin access)
2. Navigate to **Settings → Webhooks → Add webhook**
3. Configure:
   - **Payload URL**: `https://api.github.com/repos/{owner}/{repo}/dispatches`
   - **Content type**: `application/json`
   - **Secret**: (optional, for security)
   - **Events**: Select "Just the push event"
4. Add authentication header if needed

This will trigger the `repository_dispatch` event in your fork.

---

## Cost Considerations

### GitHub Actions Minutes

- **Free tier**: 2,000 minutes/month for private repos (unlimited for public)
- Each translation run can take 30-120 minutes depending on file count
- Monitor usage in **Settings → Billing → Actions**

### Storage

- **Cache**: 10 GB limit across all repositories
- **Artifacts**: Included in your storage quota
- Database size typically: 10-50 MB (grows over time)

### Recommendations

- Run scheduled checks every 6-12 hours (not every hour)
- Use manual dispatch for testing
- Clean up old artifacts periodically
- Monitor API rate limits for GitHub and LLM services

---

## Troubleshooting

### Workflow Not Triggering on Upstream Changes

**Symptom**: Scheduled runs don't detect upstream changes

**Solutions**:

- Verify upstream remote configuration
- Check that the fork is not too far behind
- Manually trigger via workflow_dispatch to test

### SQLite Database Corruption

**Symptom**: Workflow fails with database errors

**Solutions**:

1. Download latest artifact from a successful run
2. Inspect with SQLite browser
3. If corrupted, delete cache and start fresh:
   - Go to **Actions → Caches**
   - Delete all `sqlite-cache-*` entries
   - Next run will create a fresh database

### Rate Limiting

**Symptom**: API errors or throttling

**Solutions**:

- Increase delays between API calls (configure in code)
- Use a different LLM provider
- Implement exponential backoff
- Check GitHub API rate limits: `curl -H "Authorization: token $TOKEN" https://api.github.com/rate_limit`

### Concurrent Runs

**Symptom**: Multiple workflows running simultaneously

**Solution**: The `concurrency` setting prevents this, but if you manually trigger multiple times, cancel old runs

---

## Future Enhancements

- [ ] Add workflow for PR review automation
- [ ] Implement database backup to cloud storage (S3, GCS)
- [ ] Add notification system (Slack, Discord, email)
- [ ] Create dashboard for translation progress
- [ ] Add rollback mechanism for failed translations
- [ ] Implement A/B testing for translation quality

---

## Support

For issues or questions:

1. Check workflow logs in Actions tab
2. Download and inspect artifacts
3. Open an issue in the repository
4. Review the main project documentation

---

## License

Same as the parent project (MIT).
