import os
import json
import re
from github import Github
import anthropic

# Initialize APIs
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
REPO_NAME = os.getenv("GITHUB_REPOSITORY")
PR_NUMBER = int(os.getenv("PR_NUMBER"))
MODE = os.getenv("AGENT_MODE") # "review" or "apply"

gh = Github(GITHUB_TOKEN)
repo = gh.get_repo(REPO_NAME)
pr = repo.get_pull(PR_NUMBER)
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# File extensions relevant to Android development
ANDROID_EXTENSIONS = ('.kt', '.java', '.xml', '.gradle', '.gradle.kts', 'AndroidManifest.xml')

def get_pr_files():
    """Fetches changed Android files from the Pull Request."""
    files_data = []
    for f in pr.get_files():
        if f.filename.endswith(ANDROID_EXTENSIONS) and f.status != 'removed':
            try:
                content = repo.get_contents(f.filename, ref=pr.head.sha).decoded_content.decode('utf-8')
                files_data.append({"path": f.filename, "content": content})
            except Exception as e:
                print(f"Skipping file {f.filename}: {e}")
    return files_data

def run_android_review(files):
    """Performs an Android-focused review using Anthropic Claude."""
    system_prompt = """
    You are a Principal Android Architect specializing in Kotlin, Jetpack Compose, 
    Android Architecture Components (MVVM/MVI), Coroutines/Flow, Memory Management, 
    Security, and Build Optimizations (Gradle).

    Task:
    1. Provide a concise, high-level code review of the PR.
    2. Focus on Android Best Practices:
       - Memory leaks (Context usage, ViewBinding leaks)
       - Coroutine scopes & Dispatcher usage
       - Unnecessary recompositions in Jetpack Compose
       - Hardcoded strings/secrets/API keys
       - Clean Architecture violation (Data vs Domain vs UI layer leakage)
    3. Output an Improvement Plan with step-by-step changes.
    4. Provide the EXACT code changes needed in JSON block format at the bottom of your response so an automated script can apply them.

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

    user_prompt = f"Review the following PR Android code files:\n\n"
    for f in files:
        user_prompt += f"--- FILE: {f['path']} ---\n{f['content']}\n\n"

    response = anthropic_client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=4096,
        temperature=0.2,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_prompt}
        ]
    )
    
    return response.content[0].text

def apply_improvements(review_comment_body):
    """Extracts JSON changes from a review and applies them back to the PR branch."""
    json_match = re.search(r"```json_changes\n(.*?)\n```", review_comment_body, re.DOTALL)
    
    if not json_match:
        pr.create_issue_comment("❌ Could not find executable code changes in the last review plan.")
        return

    changes = json.loads(json_match.group(1))
    
    for change in changes:
        file_path = change["path"]
        new_content = change["content"]
        
        try:
            existing_file = repo.get_contents(file_path, ref=pr.head.ref)
            repo.update_file(
                path=file_path,
                message=f"refactor(android-agent): Auto-implemented improvements for {file_path}",
                content=new_content,
                sha=existing_file.sha,
                branch=pr.head.ref
            )
            print(f"Updated: {file_path}")
        except Exception as e:
            # If new file creation is needed
            repo.create_file(
                path=file_path,
                message=f"feat(android-agent): Created {file_path}",
                content=new_content,
                branch=pr.head.ref
            )
            print(f"Created: {file_path}")

    pr.create_issue_comment("✅ **Agent Action Completed**: All proposed improvements have been applied and pushed to this PR branch!")

def main():
    files = get_pr_files()
    if not files:
        pr.create_issue_comment("🤖 **Android AI Agent**: No relevant Android source files found in this PR.")
        return

    if MODE == "review":
        pr.create_issue_comment("🔄 **Android AI Agent** (Claude) is analyzing your code and generating an improvement plan...")
        review_result = run_android_review(files)
        
        comment_body = (
            "## 📱 Android AI Code Review & Improvement Plan\n\n"
            f"{review_result}\n\n"
            "---\n"
            "### 🛠️ How to Apply Improvements:\n"
            "If you approve this plan, reply to this PR with the comment:\n"
            "**`/apply-plan`**"
        )
        pr.create_issue_comment(comment_body)

    elif MODE == "apply":
        # Find the latest comment from the AI agent containing json_changes
        comments = list(pr.get_issue_comments())
        for c in reversed(comments):
            if "```json_changes" in c.body:
                pr.create_issue_comment("🚀 **Android AI Agent**: Applying approved code improvements...")
                apply_improvements(c.body)
                return
        pr.create_issue_comment("❌ Could not find a previously generated improvement plan to apply.")

if __name__ == "__main__":
    main()
