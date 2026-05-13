# Firebase Functions deployment prerequisites

This project deploys Cloud Functions with `firebase-tools` from CI. These notes reflect the Version 1.0.0 baseline and the targeted Functions deploy workflow in `.github/workflows/deploy-firebase-function.yml`.

## Version 1.0.0 deployment status

The v1 targeted deployment workflow currently builds `firebase/src/targetedDeployIndex.ts` and deploys selected Functions used by the web/mobile baseline, including division placeholder/merge/email tools, match update/scoring/reporting hooks, and feedback submission. Full backend deploys can still be run manually with the Firebase CLI when rules, indexes, or all Functions need to be refreshed.

## Required IAM for the deployer principal

The principal represented by `FIREBASE_SERVICE_ACCOUNT_JSON` must have permissions to deploy functions **and** impersonate the runtime service account.

At minimum, ensure:

- Cloud Functions/Admin deploy permissions (project-level, e.g. `roles/cloudfunctions.developer` or `roles/cloudfunctions.admin`)
- Cloud Build permissions (e.g. `roles/cloudbuild.builds.editor`)
- Artifact Registry permissions (e.g. `roles/artifactregistry.writer`)
- Secret Manager deploy-time secret binding permissions on `GITHUB_TOKEN` (e.g. `roles/secretmanager.admin` on only the `GITHUB_TOKEN` secret so Firebase CLI can update the secret IAM policy for the Functions runtime service account)
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

## Fix for `secretmanager.secrets.setIamPolicy` 403

If deploy fails while Firebase CLI is ensuring runtime access to the feedback token secret:

- `Permission 'secretmanager.secrets.setIamPolicy' denied for resource 'projects/PROJECT_ID/secrets/GITHUB_TOKEN'`

The root cause is that the deployer principal can read the secret but cannot update the `GITHUB_TOKEN` secret IAM policy. When a function declares `defineSecret('GITHUB_TOKEN')`, Firebase CLI verifies that the Functions runtime service account can access that secret. If the runtime service account is not already bound correctly, Firebase CLI updates the secret IAM policy during deploy. The principal represented by `FIREBASE_SERVICE_ACCOUNT_JSON` therefore needs `secretmanager.secrets.setIamPolicy` on `GITHUB_TOKEN`.

Recommended Console fix with the narrowest resource scope:

1. Open **Google Cloud Console** and select the project used by `FIREBASE_PROJECT_ID`.
2. Go to **Security > Secret Manager**.
3. Open the `GITHUB_TOKEN` secret. If it does not exist, create it first with the GitHub token value.
4. Open the secret **Permissions** tab, or open the right-side **Info panel**.
5. Click **Grant access**.
6. Add the service account whose key is stored in the GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON` as the principal, for example `firebase-adminsdk-fbsvc@PROJECT_ID.iam.gserviceaccount.com`.
7. Grant **Secret Manager Admin** (`roles/secretmanager.admin`) on this `GITHUB_TOKEN` secret.
8. Save and rerun the deploy workflow.

Do not grant this at the project level unless you intentionally want the deployer to administer every secret in the project.


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

1. Resolves the Firebase params from GitHub Actions variables, defaulting to the current workflow repository owner/name when `GITHUB_OWNER` or `GITHUB_REPO` are unset.
2. Confirms the deployer service account can describe and access the latest `GITHUB_TOKEN` Secret Manager version.
3. Uses the secret value to call the configured GitHub issue creation endpoint with an intentionally invalid payload. A `422` response verifies authentication/authorization reached GitHub validation without creating an issue.
4. Writes the non-secret params to `.env.$FIREBASE_PROJECT_ID` before `firebase deploy` so Firebase CLI non-interactive mode can resolve `defineString` params without prompting.

You can run the same check locally after authenticating with `gcloud`:

```bash
export FIREBASE_PROJECT_ID="your-firebase-project"
export GITHUB_OWNER="your-github-org-or-user" # defaults to github.repository_owner in CI
export GITHUB_REPO="your-feedback-repo"      # defaults to github.event.repository.name in CI
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

These GitHub Actions variables are written to `.env.$FIREBASE_PROJECT_ID` and passed as Firebase Functions params during deploy:

- `GITHUB_OWNER` (optional; defaults to the current workflow repository owner)
- `GITHUB_REPO` (optional; defaults to the current workflow repository name)
- `GITHUB_API_URL` (optional; defaults to `https://api.github.com`)
- `GITHUB_FEEDBACK_LABELS` (optional; defaults to `feedback`)
