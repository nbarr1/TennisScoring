# Firebase Deployment

These notes reflect the current stable `1.0.1` repository state.

## Deploy shape

- Firebase configuration lives in `firebase/firebase.json`.
- Firestore rules live in `firebase/firestore.rules`.
- Storage rules live in `firebase/storage.rules`.
- Firestore indexes live in `firebase/firestore.indexes.json`.
- Full Functions exports are declared in `firebase/src/index.ts`.
- Targeted deploy exports are declared in `firebase/src/targetedDeployIndex.ts` and bundled by `pnpm --filter @tennis/firebase-functions build:targeted-deploy`.

The targeted deploy bundle currently includes match update/scoring/historic recording, selected division and membership management, season/level backfill, CSV export, feedback submission, invites, invite previews, and invite acceptance. Use a full backend deploy only when intentionally refreshing all Function exports.

## CI workflow

`.github/workflows/deploy-firebase-function.yml` runs on manual dispatch and on pushes to `main` that touch Firebase, shared package, or the workflow itself. It:

1. Installs with `pnpm@9.15.5`.
2. Uses Node.js `22`.
3. Builds the targeted Functions bundle from the workspace root.
4. Authenticates with Google Cloud using `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_PROJECT_ID`.
5. Verifies the feedback GitHub token and repository configuration.
6. Writes Firebase Functions params to `.env.$FIREBASE_PROJECT_ID`.
7. Runs the targeted Firebase deploy.

## Required IAM

The principal represented by `FIREBASE_SERVICE_ACCOUNT_JSON` needs enough access to deploy Cloud Functions and allow Firebase CLI to bind runtime secrets:

- Cloud Functions deploy permissions, such as `roles/cloudfunctions.developer` or `roles/cloudfunctions.admin`.
- Cloud Build permissions, such as `roles/cloudbuild.builds.editor`.
- Artifact Registry write permissions, such as `roles/artifactregistry.writer`.
- Service Account User on the runtime service account, typically `PROJECT_NUMBER-compute@developer.gserviceaccount.com` unless a custom runtime service account is configured.
- Secret Manager access to describe/read `GITHUB_TOKEN` and update that secret IAM policy if Firebase CLI needs to grant runtime access.

Prefer granting Secret Manager admin access only on the `GITHUB_TOKEN` secret rather than project-wide.

## Fix: missing `iam.serviceaccounts.actAs`

If deployment fails because the caller lacks `iam.serviceaccounts.actAs`, grant Service Account User on the runtime service account:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --member="serviceAccount:DEPLOYER_SA@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Replace the service account values with the project number and deployer service account used by `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Fix: missing `secretmanager.secrets.setIamPolicy`

If deployment fails while binding `GITHUB_TOKEN` to the Functions runtime service account, grant the deployer Secret Manager Admin on only the `GITHUB_TOKEN` secret:

1. Open Google Cloud Console for `FIREBASE_PROJECT_ID`.
2. Go to **Security > Secret Manager**.
3. Open or create the `GITHUB_TOKEN` secret.
4. Open the secret **Permissions** panel.
5. Grant the deployer principal `roles/secretmanager.admin` for that secret.
6. Rerun the deploy workflow.

## Feedback GitHub integration

Feedback issue creation is handled by the `submitFeedback` Cloud Function. Do not add GitHub tokens, private keys, or installation tokens to `apps/web`, `apps/mobile`, `NEXT_PUBLIC_*`, or `EXPO_PUBLIC_*` variables.

Configure the token and params for the target Firebase project:

```bash
firebase functions:secrets:set GITHUB_TOKEN

GITHUB_OWNER="your-github-org-or-user"
GITHUB_REPO="your-feedback-repo"
GITHUB_FEEDBACK_LABELS="feedback"
GITHUB_API_URL="https://api.github.com"
APP_BASE_URL="https://your-web-app.example"
```

The workflow accepts `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_FEEDBACK_LABELS`, `GITHUB_API_URL`, and `APP_BASE_URL` as GitHub Actions variables or defaults where defined by the workflow.

## Local feedback preflight

After authenticating with `gcloud`, verify the GitHub token can reach issue creation without creating an issue:

```bash
export FIREBASE_PROJECT_ID="your-firebase-project"
export GITHUB_OWNER="your-github-org-or-user"
export GITHUB_REPO="your-feedback-repo"
export GITHUB_API_URL="https://api.github.com"

token="$(gcloud secrets versions access latest --secret GITHUB_TOKEN --project "$FIREBASE_PROJECT_ID")"
curl --silent --show-error --location \
  --request POST \
  --header 'Accept: application/vnd.github+json' \
  --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  --data '{}' \
  "${GITHUB_API_URL%/}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues"
```

A `422` response means authentication and authorization reached GitHub validation without creating an issue.

## Rules and emulator checks

Run these checks before deploying rules or authorization-sensitive Functions:

```bash
pnpm check:firebase-rules
pnpm --filter @tennis/firebase-functions test:rules
```

The emulator smoke test uses Firestore and Storage emulators configured in `firebase/firebase.json`.
