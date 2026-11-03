# NOON Store

![NOON Store](https://raw.githubusercontent.com/mhamad-code/Noon-Story/main/app.html)

**A personal Android app store powered by GitHub releases** – all apps are published as GitHub releases and listed live on this site.

[[cite: Project Overview | README.txt | Overview of Noon Store]]

## Features

- **Live app listings** – site reads `data/apps.json` generated automatically from GitHub releases.  
- **Responsive design** – modern CSS, works on mobile and desktop.  
- **Search & filter** – search by app name or description; results update instantly.  
- **Version history** – each app shows its changelog and download counts.  
- **Open source** – all code is public on GitHub under the MIT license.

[[cite: How it works | scripts/build-apps-json.mjs | Script that builds data/apps.json]]

## Publishing a new app

1. In the app repository, create a GitHub release titled `latest` and upload the APK (e.g., `MyApp.apk`).  
2. Optionally add assets: `icon.png`, `screenshots/*.png`.  
3. The `update-apps.yml` workflow runs every 30 minutes and updates `data/apps.json`.  
4. New apps appear automatically after the next run.

[[cite: Publishing steps | docs/publish-release-step.yml | Instructions to publish a new app release]]

## License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

## Developer

**Muhammad Hamra** – all rights reserved.  
All apps published on this store are created by Muhammad Hamra.  
For any questions or contributions, please open an issue or contact via GitHub.

[[cite: Developer credit | README.txt | Developer credit and copyright]]