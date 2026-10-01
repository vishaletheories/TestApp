# Notion to Antigravity GitFlow Protocol

When working on any ticket, bug, or feature from Notion, strictly adhere to the following senior engineering workflow:

## 1. Ticket Discovery & Claim
- Query the Notion `Bug & Task Tracker` database for tickets where `Status == "Not started"` (or target the ticket specified by the user).
- Read the full requirements, acceptance criteria, and linked architecture specs.
- Update the ticket `Status` in Notion to `"In progress"` so team members know it is actively being worked on.

## 2. Branching Strategy (GitFlow Standard)
- Always start from the latest `develop` branch:
  ```bash
  git checkout develop
  git pull origin develop
  ```
- Create a dedicated feature branch using the ticket title (kebab-case):
  ```bash
  git checkout -b feat/<ticket-title-slug>
  ```
  *(Example: `feat/user-auth-screen` or `feat/landing-page-hero`)*

## 3. Implementation & Quality Assurance
- Implement the requested components/features strictly adhering to the Notion specification.
- Maintain modern design aesthetics: clean typography, dark modes, glassmorphism, responsive layouts.
- Validate the build locally with `npm run build` or the respective test suite. Never commit broken code.

## 4. GitHub Push & Pull Request
- Stage and commit with clean conventional commits:
  ```bash
  git add .
  git commit -m "feat: <clear summary of ticket> [Notion]"
  ```
- Push the feature branch to GitHub:
  ```bash
  git push -u origin feat/<ticket-title-slug>
  ```
- Construct the Pull Request URL targeting `develop`:
  `https://github.com/vishaletheories/TestApp/compare/develop...feat/<ticket-title-slug>?expand=1`

## 5. Notion Sync & Close
- Update the Notion ticket's `GitHub PR` property with the Pull Request URL.
- Update the ticket's `Status` to `"Done"`.
