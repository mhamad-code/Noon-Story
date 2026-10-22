NOON Store - personal app store for github.com/mhamad-code
==========================================================

FOLDERS
  index.html, app.html, repos.html   pages (store, app details, repositories)
  privacy.html, terms.html           legal pages
  css/style.css                      all styles
  js/common.js                       shared code (GitHub API, app cards, header, footer)
  data/apps.json                     list of apps, created automatically (see below)
  scripts/build-apps-json.mjs        script that creates data/apps.json
  .github/workflows/update-apps.yml  runs the script every 30 minutes
  docs/publish-release-step.yml      step to add to each app's build workflow

HOW NEW APPS APPEAR
1. Every app repository publishes its APK to a GitHub release (docs/publish-release-step.yml).
   GitHub Actions artifacts cannot be downloaded without a login, so releases are needed.
2. The "Update apps.json" workflow of this site scans all repositories every 30 minutes
   and saves the apps in data/apps.json. The website reads that file, so visitors do not
   hit the GitHub API limit (60 requests per hour).
   To refresh at once: Actions tab -> Update apps.json -> Run workflow.
3. If data/apps.json is empty or missing, the site asks the GitHub API directly.

HOW APPS ARE FOUND
  - A release tagged "latest" with an .apk is used if it exists; otherwise every release is scanned.
  - One app per repository: it is named after the repository.
  - Several apps in one repository: each distinct APK file name becomes an app.
  - Optional files in the release: icon.png (several apps: name-icon.png),
    screenshot1.png, screenshot2.png ... (several apps: name-screenshot1.png).
  - Single-app repositories also use icon.png, the Android launcher icon and a screenshots/ folder.
  - The release description is shown as "About this app".

PUBLISHING THE SITE
  Put this folder in a GitHub repository and turn on GitHub Pages (or use Netlify).
  Every commit of apps.json updates the site by itself.
