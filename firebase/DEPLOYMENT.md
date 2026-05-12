# Firebase Functions deployment prerequisites

This project deploys Cloud Functions with `firebase-tools` from CI.

## Required IAM for the deployer principal

The principal represented by `FIREBASE_SERVICE_ACCOUNT_JSON` must have permissions to deploy functions **and** impersonate the runtime service account.

At minimum, ensure:

- Cloud Functions/Admin deploy permissions (project-level, e.g. `roles/cloudfunctions.developer` or `roles/cloudfunctions.admin`)
- Cloud Build permissions (e.g. `roles/cloudbuild.builds.editor`)
- Artifact Registry permissions (e.g. `roles/artifactregistry.writer`)
- Secret Manager access for feedback deployment preflight and secret binding (e.g. `roles/secretmanager.secretAccessor` on the `GITHUB_TOKEN` secret)
- **Service Account User** on the runtime service account used by Functions:
  - `roles/iam.serviceAccountUser` on `PROJECT_NUMBER-compute@developer.gserviceaccount.com` (or your custom runtime SA)

## Fix for `iam.serviceaccounts.actAs` 403

If deploy fails with:

- `Caller is missing permission 'iam.serviceaccounts.actAs'`

Grant `roles/iam.serviceAccountUser` to the deployer principal on the runtime SA:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --member="serviceAccount:DEPLOYER_SA@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Replace `DEPLOYER_SA@PROJECT_ID.iam.gserviceaccount.com` with the service account whose key is stored in `FIREBASE_SERVICE_ACCOUNT_JSON`.


## GitHub feedback integration

Feedback issue creation is handled only by the `submitFeedback` Cloud Function. Keep all GitHub credentials out of `apps/web` and `apps/mobile`; do not add `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variables for GitHub tokens, private keys, or installation tokens.

Configure the repository target as Functions params/config and store the token in Functions secret storage:

```bash
firebase functions:secrets:set GITHUB_TOKEN

# Params consumed by firebase/src/feedback/submitFeedback.ts
# Store these with your Functions environment/params for the target project.
GITHUB_OWNER="your-github-org-or-user"
GITHUB_REPO="your-feedback-repo"
GITHUB_FEEDBACK_LABELS="feedback"
```

The `GITHUB_TOKEN` secret can be a fine-grained personal access token or an app installation token with permission to create issues in the configured repository.

Before deploying from CI, the workflow runs a preflight check that:

1. Fails if required GitHub Actions variables for the Firebase params are empty.
2. Confirms the deployer service account can describe and access the latest `GITHUB_TOKEN` Secret Manager version.
3. Uses the secret value to call the configured GitHub issue creation endpoint with an intentionally invalid payload. A `422` response verifies authentication/authorization reached GitHub validation without creating an issue.

You can run the same check locally after authenticating with `gcloud`:

```bash
export FIREBASE_PROJECT_ID="your-firebase-project"
export GITHUB_OWNER="your-github-org-or-user"
export GITHUB_REPO="your-feedback-repo"
export GITHUB_API_URL="https://api.github.com"

gcloud secrets describe GITHUB_TOKEN \
  --project "$FIREBASE_PROJECT_ID" \
  --format='value(name)' > /dev/null

token="$(gcloud secrets versions access latest \
  --secret GITHUB_TOKEN \
  --project "$FIREBASE_PROJECT_ID")"

status="$(curl --silent --show-error --location \
  --request POST \
  --output /tmp/github-feedback-check.json \
  --write-out '%{http_code}' \
  --header 'Accept: application/vnd.github+json' \
  --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  --data '{}' \
  "${GITHUB_API_URL%/}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues")"

test "$status" = "422"
```

## Workflow secrets

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

## Workflow variables

These GitHub Actions variables are passed to Firebase as Functions params during deploy:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_API_URL` (optional; defaults to `https://api.github.com`)
- `GITHUB_FEEDBACK_LABELS` (optional; defaults to `feedback`)
