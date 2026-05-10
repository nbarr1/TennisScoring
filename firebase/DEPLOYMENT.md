# Firebase Functions deployment prerequisites

This project deploys Cloud Functions with `firebase-tools` from CI.

## Required IAM for the deployer principal

The principal represented by `FIREBASE_SERVICE_ACCOUNT_JSON` must have permissions to deploy functions **and** impersonate the runtime service account.

At minimum, ensure:

- Cloud Functions/Admin deploy permissions (project-level, e.g. `roles/cloudfunctions.developer` or `roles/cloudfunctions.admin`)
- Cloud Build permissions (e.g. `roles/cloudbuild.builds.editor`)
- Artifact Registry permissions (e.g. `roles/artifactregistry.writer`)
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

## Workflow secrets

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
