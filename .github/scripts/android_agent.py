import os
import json
import re
import subprocess
from google import genai
from google.genai import types

# Initialize APIs
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODE = os.getenv("AGENT_MODE", "review")  # "review" or "apply"
PLAN_FILE = ".github/ai_plan.json"

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

ANDROID_EXTENSIONS = ('.kt', '.java', '.xml', '.gradle', '.gradle.kts', 'AndroidManifest.xml')

def get_branch_files():
    """Fetches recently modified Android files on the current branch (or scans key source files)."""
    changed_files = []
    
    # Try getting changed files in the last commit
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True, text=True, check=True
        )
        changed_files = [f.strip() for f in result.stdout.splitlines() if f.strip().endswith(ANDROID_EXTENSIONS)]
    except Exception:
        pass

    # Fallback: If no git diff available, scan app/src/main
    if not changed_files:
        for root, _, files in os.walk("app/src/main"):
            for file in files:
                if file.endswith(ANDROID_EXTENSIONS):
                    changed_files.append(os.path.join(root, file))

    files_data = []
    for path in changed_files[:20]:  # Limit to 20 files per run to stay well within token limits
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    files_data.append({"path": path, "content": f.read()})
            except Exception as e:
                print(f"Skipping {path}: {e}")
                
    return files_data

def run_android_review(files):
    """Performs an Android code review using Gemini."""
    system_prompt = """
    You are a Principal Android Architect specializing in Kotlin, Jetpack Compose, 
    Android Architecture Components (MVVM/MVI), Coroutines/Flow, Memory Management, 
    Security, and Build Optimizations (Gradle).

    Task:
    1. Provide a concise, high-level code review of the branch files.
    2. Focus on Android Best Practices (memory leaks, recomposition issues, coroutine scopes, architecture layers, secrets).
    3. Output an Improvement Plan with step-by-step suggestions.
    4. Provide the EXACT code changes needed in JSON block format at the bottom of your response.

    Format for JSON changes block:
    ```json_changes
    [
      {
        "path": "app/src/main/java/com/example/MyViewModel.kt",
        "content": "<FULL_UPDATED_FILE_CONTENT>"
      }
    ]
    ```
    """

    user_prompt = "Review the following Android branch code files:\n\n"
    for f in files:
        user_prompt += f"--- FILE: {f['path']} ---\n{f['content']}\n\n"

    response = gemini_client.models.generate_content(
        model='gemini-2.5-pro',
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
        )
    )
    
    return response.text

def write_to_summary(text):
    """Outputs text to GitHub Action Step Summary."""
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(text + "\n")

def apply_improvements():
    """Reads saved JSON plan and modifies files on the current branch."""
    if not os.path.exists(PLAN_FILE):
        print(f"❌ Error: Plan file '{PLAN_FILE}' not found. Run review mode first.")
        return False

    with open(PLAN_FILE, "r", encoding="utf-8") as f:
        changes = json.load(f)

    for change in changes:
        file_path = change["path"]
        new_content = change["content"]
        
        # Ensure parent directories exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Applied changes to: {file_path}")

    return True

def main():
    if MODE == "review":
        print("🔍 Scanning branch code...")
        files = get_branch_files()
        if not files:
            print("No relevant Android source files found.")
            return

        print("🔄 Generating review and improvement plan with Gemini...")
        review_result = run_android_review(files)
        
        # Extract JSON changes and save locally
        json_match = re.search(r"```json_changes\n(.*?)\n```", review_result, re.DOTALL)
        if json_match:
            try:
                changes_json = json.loads(json_match.group(1))
                os.makedirs(".github", exist_ok=True)
                with open(PLAN_FILE, "w", encoding="utf-8") as f:
                    json.dump(changes_json, f, indent=2)
                print(f"Saved proposed plan to {PLAN_FILE}")
            except Exception as e:
                print(f"Warning: Failed to parse changes JSON: {e}")

        # Post results to Workflow Summary
        summary_markdown = (
            "## 📱 Android AI Code Review & Improvement Plan\n\n"
            f"{review_result}\n\n"
            "---\n"
            "### 🛠️ How to Apply Improvements to Branch:\n"
            "1. Go to **Actions** tab in GitHub.\n"
            "2. Select **Android AI Agent** workflow.\n"
            "3. Click **Run workflow**, choose `mode: apply`, and execute."
        )
        write_to_summary(summary_markdown)

    elif MODE == "apply":
        print("🚀 Applying approved improvements directly to current branch...")
        success = apply_improvements()
        if success:
            print("✅ Improvements successfully written to workspace files.")

if __name__ == "__main__":
    main()
