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

## Workflow secrets

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
