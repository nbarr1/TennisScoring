# Operations runbook

This runbook covers the checks and console settings that keep the live app observable and recoverable: the uptime check, Firestore backups, deploy approvals, error alerts, the ranking rebuild after a release, and rollback. Most of these settings live in the GitHub or Google Cloud console rather than in this repository, so each section gives the exact steps.

## Uptime check

`.github/workflows/uptime.yml` requests two web endpoints every hour and fails when either one answers anything but 200:

- `/api/health` answers 200 whenever the Next.js server is up.
- `/api/readiness` answers 503 when the deployment is missing any of `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXTAUTH_SECRET`, or the three `FIREBASE_ADMIN_*` variables.

Each endpoint gets three attempts, 20 seconds apart, so one slow cold start doesn't count as a failure. The run summary lists the status of each endpoint.

To set it up:

1. Confirm that the `APP_BASE_URL` repository variable holds the live web origin, such as `https://tennis.example.com`. The Functions deploy already requires it. When the uptime check should poll a different origin, set an `UPTIME_BASE_URL` repository variable instead, which takes precedence.
2. Run the workflow once from the Actions tab (**Uptime check**, then **Run workflow**) and confirm that both endpoints report 200.
3. Make sure failure emails reach you. GitHub emails a failed scheduled run to the person who last changed the workflow's `cron` line. To check, go to **GitHub Settings**, then **Notifications**, then **System**, then **Actions**, and confirm that **Failed workflows only** is selected with email delivery.

What the check doesn't cover:

- It doesn't read Firestore or call a Cloud Function, so a Firebase outage or a broken function passes. The function error alert in [Cloud Functions error alerts](#cloud-functions-error-alerts) covers those.
- GitHub can start scheduled runs several minutes late, so the check is roughly hourly.
- GitHub turns off scheduled workflows in a public repository after 60 days without a commit. If that happens, turn it back on from the workflow's page on the Actions tab.

## Firestore backups

Firestore has two independent recovery features. Turning on both is the safest choice. Both need the Blaze (pay as you go) plan, which Cloud Functions already require.

### Point-in-time recovery

Point-in-time recovery (PITR) keeps versions of every document for the last seven days, so you can read or export the database as it was at any minute in that window.

1. In the Google Cloud console, open **Firestore**, select the `(default)` database, and open **Disaster recovery**.
2. Turn on **Point-in-time recovery**.

The same change from a terminal:

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=<PROJECT_ID>
```

To recover data, export the database as it was at a given minute, then import the documents you need into a new database or copy them back:

```bash
gcloud firestore export gs://<BUCKET>/pitr-<DATE> \
  --database='(default)' --snapshot-time=<RFC3339_TIME> --project=<PROJECT_ID>
```

`--snapshot-time` must be a whole minute within the last seven days, such as `2026-11-02T10:00:00Z`.

### Scheduled backups

A backup schedule keeps daily copies for longer than the PITR window.

```bash
gcloud firestore backups schedules create \
  --database='(default)' --recurrence=daily --retention=14d --project=<PROJECT_ID>
gcloud firestore backups schedules list --database='(default)' --project=<PROJECT_ID>
```

A backup is restored into a new database rather than over the live one:

```bash
gcloud firestore backups list --project=<PROJECT_ID>
gcloud firestore databases restore \
  --source-backup=<BACKUP_RESOURCE_NAME> --destination-database=restored-<DATE> --project=<PROJECT_ID>
```

These flags match the `gcloud` releases current in 2026. Run each command with `--help` first if your `gcloud` is older. Backups and PITR both add storage charges, which the Firestore pricing page lists.

Neither feature covers Cloud Storage, which holds the generated match report PDFs. Losing them isn't fatal, because `generateMatchReport` rebuilds a match's PDF when its `reportUrl` is cleared. That function is left out of the targeted Functions deploy, so it ships only with a full deploy: dispatch **Deploy Firebase Functions (targeted)** with **scope** set to `full` (see [firebase/DEPLOYMENT.md](../firebase/DEPLOYMENT.md)).

## Deploy approvals

The Functions deploy (`deploy-firebase-function.yml`) and the rules deploy (`deploy-firebase-rules.yml`) both run in the `staging` GitHub environment, and the Functions deploy starts on every merge to `Main` that touches `firebase/**` or `packages/shared/**`. If the `staging` Firebase project is the one players use, add a required reviewer so that no deploy reaches it without approval:

1. In the repository, go to **Settings**, then **Environments**, then **staging**.
2. Select **Required reviewers**, add yourself, and select **Save protection rules**.
3. Optionally, under **Deployment branches and tags**, choose **Selected branches and tags** and add `Main`, so a dispatch from another branch can't use the environment's secrets.

After this, every merge that touches `firebase/**` or `packages/shared/**` waits on the Actions tab with **Review deployments** until you approve it. A deploy that waits too long expires after 30 days, and you can dispatch it again by hand.

## Cloud Functions error alerts

Cloud Logging can email you when a function logs an error.

1. In the Google Cloud console, open **Logging**, then **Logs Explorer**.
2. Run this query:

   ```text
   resource.type="cloud_run_revision"
   severity>=ERROR
   ```

   Second-generation functions run on Cloud Run, which is why the resource type is `cloud_run_revision`.
3. Select **Create alert**, name it "Cloud Functions errors", set the notification rate limit to one notification every hour, and choose or create an email notification channel.

The scheduled functions (`sendMatchReminders` every hour and `autoConfirmExpiredReports` every day at 00:00 UTC) log a failed send rather than throwing, so this alert is the main way to see them failing.

## After a release that changes ranking code

Some releases repair stored data the first time rankings are rebuilt. For example, results saved without a division level are fixed by the rebuild. After the Functions deploy and the web release are both live:

1. Sign in to the web app as an admin or the division's leader, and open **Admin**.
2. Choose the division in the division switcher, open the **Tools** tab, and select **Rebuild rankings** on the **Ranking repair** card.
3. Wait for the success message, which reports how many matches it counted and repaired.
4. Repeat for each division. The button rebuilds only the selected division.

## Rollback

- **Firestore and Storage rules:** dispatch **Deploy Firebase rules** in `deploy` mode with `ref` set to the last commit whose rules worked. The summary of each earlier deploy run names the commit it shipped.
- **Cloud Functions:** dispatch **Deploy Firebase Functions (targeted)** from the last good commit. It deploys whatever that commit's code is.
- **Web:** promote the previous deployment in the Vercel dashboard (**Deployments**, the previous deployment's menu, then **Promote to Production**).
- **Mobile:** a store release can't be withdrawn from installed phones. Halt a staged rollout in the Play Console, then ship a fixed build with a higher `versionCode`.
