# Agent Guide: HOSTIX-APP

IMPORTANT: I will NOT store or include any personal access tokens (PATs) or other secrets in this repository. You provided a PAT in the chat; do NOT commit it to the repo. Instead follow the secure instructions below to provide credentials.

Repository
- Repo: mushtaqahmaduop/HOSTIX-APP
- URL: https://github.com/mushtaqahmaduop/HOSTIX-APP
- Issues: https://github.com/mushtaqahmaduop/HOSTIX-APP/issues
- Pull requests: https://github.com/mushtaqahmaduop/HOSTIX-APP/pulls
- Actions: https://github.com/mushtaqahmaduop/HOSTIX-APP/actions
- Releases: https://github.com/mushtaqahmaduop/HOSTIX-APP/releases

Purpose of this file
- Give an agent a clear checklist for: understanding the code, locating and diagnosing errors, editing & testing, code review checklist, and secure push/PR steps.

1) Safety and secrets (READ FIRST)
- DO NOT commit personal access tokens, private keys, or other secrets into the repository.
- Placeholder: Use the token placeholder string: <PROVIDE_PAT_SECURELY>
- Recommended secure methods to provide a PAT:
  - Locally: use the gh CLI: `gh auth login --with-token` and pipe your token via stdin, or `gh auth login` interactive flow.
  - Environment (temporary): export GITHUB_PAT="<your-pat>" in a shell session (do NOT paste in long-lived scripts). Remove it from history: `unset GITHUB_PAT` after use.
  - GitHub Actions / CI: store the PAT in repository or organization secrets (Settings  Secrets & variables  Actions) and reference it in workflow via `secrets.MY_PAT`.
  - Git credential helper: `git config --global credential.helper store` (less secure) or use credential manager for OS.

2) Quick start: clone and open
- git clone https://github.com/mushtaqahmaduop/HOSTIX-APP.git
- cd HOSTIX-APP
- Inspect top-level files: README.md, package.json (or requirements.txt), src/ or app/ directories.

3) Identify language & toolchain
- Check repo root for language indicators: package.json (Node), pom.xml (Java/Maven), requirements.txt/Pipfile/pyproject.toml (Python), Gemfile (Ruby), go.mod (Go).
- If a language-specific build/test tool exists, install it (npm/yarn/pip/pipenv/poetry/go/mvn).

4) Building, linting, testing (generic steps)
- If Node (package.json):
  - Install: `npm ci` or `npm install`
  - Lint: `npm run lint` (if defined)
  - Test: `npm test` or `npm run test`
  - Build: `npm run build` or `npm run compile`
- If Python:
  - Create venv: `python -m venv .venv && source .venv/bin/activate`
  - Install: `pip install -r requirements.txt`
  - Lint: `flake8` or `pylint` if configured
  - Test: `pytest`
- If other languages, follow their standard commands.

5) Finding errors and diagnostics
- Run the test suite: failing tests show stack traces 5 read topmost frames in your code first.
- Linter errors point to style/possible bugs.
- For runtime errors: reproduce locally with same environment (node version, python version). Use `DEBUG=*` style env vars if project uses debug logging.
- Check GitHub Actions logs: https://github.com/mushtaqahmaduop/HOSTIX-APP/actions
- Grep for TODO, FIXME, or console.error/print statements:
  - `git grep -n "TODO\|FIXME"`
- Check open issues for known failures: https://github.com/mushtaqahmaduop/HOSTIX-APP/issues

6) Editing workflow (branching and commits)
- Create a topic branch for edits: `git checkout -b fix/description-or-feature`
- Make small, focused commits with clear messages:
  - `git add . && git commit -m "fix: clear description of change"`
- Run tests & lint before committing.
- Rebase interactive to tidy commits if needed: `git rebase -i origin/main`

7) Secure pushing and PR creation
- Do NOT embed tokens in the remote URL. Use one of these methods:
  - gh CLI: `gh auth login` then `git push --set-upstream origin fix/branch` and create PR via `gh pr create --fill`
  - HTTPS + credential manager: `git push` and let credential manager prompt for PAT
  - SSH: set up SSH keys and use `git@github.com:mushtaqahmaduop/HOSTIX-APP.git`
- Create PR title and description with:
  - Motivation, Summary of change, Test plan, Screenshots/logs for bug fixes, Link to issue if any.

8) Code review checklist (what the agent should check)
- Readability: clear naming, small functions, comments where non-obvious.
- Correctness: logic covers edge cases, input validation, error handling.
- Tests: unit tests for new functionality; existing tests pass.
- Security: no secrets, proper escaping/sanitization, no eval/untrusted deserialization.
- Performance: look for obvious N^2 loops, large synchronous blocking operations.
- Dependencies: check package versions for known vulnerabilities.
- Documentation: update README/CHANGELOG if behavior changes.

9) Common error categories and how to fix them
- Missing dependencies: run install and check package managers, lockfiles.
- Version mismatch (node/python): check `.nvmrc` or `runtime.txt` and use correct runtime.
- Linting errors: run linter and follow suggestions.
- Failing tests: read stack trace, reproduce locally, add logging, write minimal failing test case.
- CI failures: view Actions logs (link above), reproduce run locally with the same env vars.

10) Automation & PR merging guidance
- Ensure CI (tests/lint/build) passes on PR.
- Use squash or merge strategy consistent with repo policy.
- For releases, update version in package/pyproject and create a release draft: https://github.com/mushtaqahmaduop/HOSTIX-APP/releases

11) Links useful to the agent
- Repo: https://github.com/mushtaqahmaduop/HOSTIX-APP
- Issues: https://github.com/mushtaqahmaduop/HOSTIX-APP/issues
- Pulls: https://github.com/mushtaqahmaduop/HOSTIX-APP/pulls
- Actions: https://github.com/mushtaqahmaduop/HOSTIX-APP/actions
- Projects: https://github.com/mushtaqahmaduop/HOSTIX-APP/projects

12) If you (the agent) need the PAT
- Never ask me (the repository) to store the PAT in code. Instead, the human operator should supply the PAT through one of the secure channels described in section 1.
- Use environment variable or gh CLI. Example (secure usage):
  - `export GITHUB_PAT="<your-pat-here>"`
  - Use it only for ephemeral operations: `gh auth login --with-token < <(echo "$GITHUB_PAT")`
  - After use: `unset GITHUB_PAT`

13) Troubleshooting steps to run and capture for humans
- Command: `npm ci && npm test` or `pytest -q`
- If failure: capture full logs, pastebin or link to issue with steps to reproduce and stack trace.

14) How to leave notes for maintainers
- Create issues for anything you fix that requires human review or design decisions.
- For small PRs, include `Closes #ISSUE` in the PR description if it fixes a tracked issue.

15) Final notes
- I refused to include the PAT you pasted here for security reasons. If you want me to perform write operations that require authentication, provide an installation method or grant appropriate access (e.g., an organization app) rather than embedding secrets in the repo.

---

If you want I can also:
- Create this file in the repository (I am adding it now).
- Create a checklist issue template for PRs or a GitHub Actions workflow to run lint/tests on every PR.

