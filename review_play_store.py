import os
import glob
from google import genai

# Verify GitHub Secret environment variable
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("❌ Error: 'GEMINI_API_KEY' secret environment variable was not found in this Codespace.")
    print("👉 Ensure the secret is added in GitHub Repo Settings -> Secrets and variables -> Codespaces.")
    exit(1)

# Initialize Gemini client using GEMINI_API_KEY from environment
client = genai.Client()

# File patterns relevant to Google Play Store technical & policy audits
target_patterns = [
    "**/AndroidManifest.xml",
    "**/build.gradle",
    "**/build.gradle.kts",
    "**/pubspec.yaml",
    "**/package.json",
    "**/*privacy*.md",
    "**/*privacy*.html",
]

found_files = {}

for pattern in target_patterns:
    for filepath in glob.glob(pattern, recursive=True):
        # Ignore dependencies and build outputs
        if any(ignored in filepath for ignored in ["node_modules", "build/", ".git", ".gradle", "Pods"]):
            continue
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                # Read up to 10k chars per file to stay efficient
                found_files[filepath] = f.read()[:10000]
        except Exception as e:
            print(f"Could not read {filepath}: {e}")

if not found_files:
    print("❌ No configuration files (Android/Flutter/React Native) were found to analyze.")
    exit(1)

print(f"🔍 Found {len(found_files)} relevant file(s) in repository. Reading metadata...")

# Construct prompt
prompt = "You are an expert Google Play Console submission specialist and Android App Auditor.\n\n"
prompt += "Analyze the following repository files for **Google Play Store readiness**:\n\n"

for path, content in found_files.items():
    prompt += f"--- BEGIN FILE: {path} ---\n{content}\n--- END FILE ---\n\n"

prompt += """
### AUDIT CRITERIA:
1. **Target API Level (SDK)**: Is `targetSdkVersion` set to meet current Google Play Store mandates (Target API 34/35+)?
2. **Permissions & Security**: Are high-risk permissions (Location, SMS, Storage, Foreground Services) declared? Are necessary usage declarations or privacy disclosures missing?
3. **App Bundle (.aab)**: Is the project configured for modern Android App Bundle release builds?
4. **Versioning**: Are `versionCode` and `versionName` properly structured?
5. **Privacy Policy & Legal**: Is there evidence of a privacy policy file or required metadata disclosures?
6. **Action Checklist**: Provide a prioritized checklist of remaining steps before uploading to the Google Play Console.

Please format your analysis as a clean Markdown report with actionable recommendation categories.
"""

print("🤖 Authenticated with GitHub Secret. Analyzing repository with Gemini 3.6 Flash...")

# Using Gemini 3.6 Flash
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents=prompt
)

report_path = "play_store_readiness_report.md"
with open(report_path, "w", encoding="utf-8") as f:
    f.write(response.text)

print(f"\n✅ Play Store Readiness Audit complete!")
print(f"📄 Report generated and saved to: {report_path}\n")
print("="*60)
print(response.text)
