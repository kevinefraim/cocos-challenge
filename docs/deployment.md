# Deployment runbook

## Render free tier

This repository includes `render.yaml`, which creates a Docker-based web
service from `master`. Render builds the repository Dockerfile for each deploy;
GitHub Actions independently builds the same image in CI.

One-time setup:

1. Create a Render account and choose **New > Blueprint**.
2. Connect `kevinefraim/cocos-challenge` and select its `render.yaml`.
3. Add `DATABASE_URL` as a secret using the PostgreSQL URL supplied for the
   challenge. Do not paste it into the repository or an image build argument.
4. Confirm that the service health check is `/ready` and that auto-deploy is
   **After CI Checks Pass**.
5. Open the generated `onrender.com` URL and verify `/health`, `/ready`, and
   `/docs`.

`GET /health` includes `commit`, obtained from Render's automatic
`RENDER_GIT_COMMIT` variable. After merging a PR, compare this value with the
merge commit SHA to confirm that automatic deployment finished. This variable
needs no manual configuration. Outside Render, `commit` is null.

The free service is suitable for an interview demo: it may spin down after 15
minutes of inactivity and take time to wake up. It is not an uptime guarantee.

## Required GitHub settings

Protect `master` in GitHub repository settings and require these checks before
merging:

- `Quality`
- `E2E and coverage`

The deployment configuration waits for those checks, so a failing commit is not
deployed.
