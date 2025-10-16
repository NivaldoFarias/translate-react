# GitHub Actions Setup Guide

Quick reference for configuring the GitHub Actions workflows for this project.

## Prerequisites

- A GitHub fork of the upstream repository
- GitHub Personal Access Token with `repo` permissions
- API keys for translation services (OpenAI/OpenRouter)

## Configuration Checklist

### 1. Repository Secrets

Go to **Settings → Secrets and variables → Actions → Repository secrets** and add:

#### `WORKFLOW_GITHUB_TOKEN`

Personal Access Token for GitHub API operations.

**How to create:**

1. Go to GitHub **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Name it: `translate-react-workflow`
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click **Generate token**
6. Copy the token (you won't see it again!)
7. Add it as `WORKFLOW_GITHUB_TOKEN` in your repository secrets

#### `OPENAI_API_KEY`

API key for OpenAI/OpenRouter or other LLM service.

**For OpenRouter:**

1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign up/Login
3. Go to **Keys** section
4. Create a new API key
5. Add it as `OPENAI_API_KEY` in your repository secrets

### 2. Repository Variables

Go to **Settings → Secrets and variables → Actions → Variables** and add:

| Variable                | Example Value                      | Description                       |
| ----------------------- | ---------------------------------- | --------------------------------- |
| `REPO_FORK_OWNER`       | `nivaldofarias`                    | Your GitHub username/org          |
| `REPO_FORK_NAME`        | `pt-br.react.dev`                  | Name of your fork                 |
| `REPO_UPSTREAM_OWNER`   | `reactjs`                          | Upstream repository owner         |
| `REPO_UPSTREAM_NAME`    | `pt-br.react.dev`                  | Upstream repository name          |
| `TARGET_LANGUAGE`       | `pt-BR`                            | Target language code              |
| `TRANSLATION_BASE_PATH` | `src/content`                      | Path to translation files         |
| `LLM_MODEL`             | `google/gemini-2.0-flash-exp:free` | LLM model identifier (optional)   |
| `OPENAI_BASE_URL`       | `https://api.openrouter.com/v1`    | API base URL (optional)           |
| `LOG_LEVEL`             | `info`                             | Logging level (optional)          |
| `ENABLE_AUTO_MERGE`     | `false`                            | Auto-merge PRs (use with caution) |

## Quick Setup Script

Run this in your terminal (replace values with your own):

```bash
# Set repository (replace with your fork)
REPO="your-username/translate-react"

# Add secrets (you'll be prompted to paste the values)
gh secret set WORKFLOW_GITHUB_TOKEN --repo $REPO
gh secret set OPENAI_API_KEY --repo $REPO

# Add variables
gh variable set REPO_FORK_OWNER --body "your-username" --repo $REPO
gh variable set REPO_FORK_NAME --body "pt-br.react.dev" --repo $REPO
gh variable set REPO_UPSTREAM_OWNER --body "reactjs" --repo $REPO
gh variable set REPO_UPSTREAM_NAME --body "pt-br.react.dev" --repo $REPO
gh variable set TARGET_LANGUAGE --body "pt-BR" --repo $REPO
gh variable set TRANSLATION_BASE_PATH --body "src/content" --repo $REPO
gh variable set LLM_MODEL --body "google/gemini-2.0-flash-exp:free" --repo $REPO
gh variable set OPENAI_BASE_URL --body "https://api.openrouter.com/v1" --repo $REPO
gh variable set LOG_LEVEL --body "info" --repo $REPO
gh variable set ENABLE_AUTO_MERGE --body "false" --repo $REPO
```

> [!NOTE]
> You need the [GitHub CLI](https://cli.github.com/) installed for the script above.

## Verify Configuration

### 1. Check Secrets

```bash
gh secret list --repo your-username/translate-react
```

Expected output:

```
OPENAI_API_KEY          Updated 2025-01-10
WORKFLOW_GITHUB_TOKEN   Updated 2025-01-10
```

### 2. Check Variables

```bash
gh variable list --repo your-username/translate-react
```

Expected output:

```
ENABLE_AUTO_MERGE       false
LLM_MODEL              google/gemini-2.0-flash-exp:free
LOG_LEVEL              info
OPENAI_BASE_URL        https://api.openrouter.com/v1
REPO_FORK_NAME         pt-br.react.dev
REPO_FORK_OWNER        nivaldofarias
REPO_UPSTREAM_NAME     pt-br.react.dev
REPO_UPSTREAM_OWNER    reactjs
TARGET_LANGUAGE        pt-BR
TRANSLATION_BASE_PATH  src/content
```

## Testing

### 1. Test CI Workflow

Push a commit to trigger the CI workflow:

```bash
git add .
git commit -m "chore: add github actions workflows"
git push origin dev
```

Go to **Actions** tab and verify the CI workflow runs successfully.

### 2. Test Translation Workflow (Manual)

1. Go to **Actions** tab
2. Select **Sync and Translate** workflow
3. Click **Run workflow**
4. Select the branch (usually `main`)
5. Click **Run workflow**

Monitor the logs to ensure it completes successfully.

## Troubleshooting

### "Resource not accessible by integration"

**Problem**: The workflow can't access the repository or create PRs.

**Solution**: Check that `WORKFLOW_GITHUB_TOKEN` has the `repo` scope.

### "Invalid credentials"

**Problem**: API authentication fails.

**Solution**: Verify secrets are set correctly and haven't expired.

### "No upstream changes detected"

**Problem**: The workflow runs but doesn't sync/translate.

**Solution**: This is normal if upstream hasn't changed. Manually trigger with `workflow_dispatch` to test.

### Database cache not persisting

**Problem**: Each run starts fresh without previous state.

**Solution**: Check that the cache is being saved/restored correctly in the workflow logs.

## Maintenance

### Update Dependencies

```bash
bun update
git add bun.lock
git commit -m "chore: update dependencies"
git push
```

### Clean Up Old Artifacts

Go to **Settings → Actions → Artifacts and logs** and delete old artifacts to save storage.

### Monitor API Usage

- **GitHub API**: Check rate limits with `gh api rate_limit`
- **OpenRouter**: Check usage dashboard
- **Actions Minutes**: Check **Settings → Billing**

## Security Best Practices

1. **Never commit secrets**: Always use GitHub Secrets
2. **Rotate tokens**: Update `WORKFLOW_GITHUB_TOKEN` every 90 days
3. **Limit permissions**: Use fine-grained tokens when possible
4. **Monitor logs**: Check for sensitive data leaks in workflow logs
5. **Enable branch protection**: Protect `main` branch from direct pushes

## Next Steps

1. ✅ Complete configuration checklist
2. ✅ Test CI workflow
3. ✅ Test translation workflow manually
4. ⏳ Set up scheduled runs (already configured for every 6 hours)
5. ⏳ Monitor first automated run
6. ⏳ Review and merge the first automated PR

## Support

- **Workflow Issues**: Check [Workflow README](.github/workflows/README.md)
- **Project Issues**: Check [Main README](../README.md)
- **GitHub Actions Docs**: https://docs.github.com/actions

Good luck! 🚀
