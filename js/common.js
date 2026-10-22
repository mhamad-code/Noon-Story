/* ==========================================================
   NOON Store - shared code
   1. Config      2. Helpers     3. GitHub API
   4. Apps        5. Data        6. UI pieces
   7. Page layout (header and footer)
   ========================================================== */


/* ---------- 1. Config ---------- */

const USER = "mhamad-code";
const API = "https://api.github.com";
const SNAPSHOT_URL = "data/apps.json";


/* ---------- 2. Helpers ---------- */

const $ = (selector, root = document) => root.querySelector(selector);

function esc(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(text ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

function fmtSize(bytes) {
  if (bytes > 1048576) {
    return (bytes / 1048576).toFixed(1) + " MB";
  }
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function fmtDate(date) {
  if (!date) {
    return "";
  }
  return new Date(date).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function fmtNum(n) {
  if (n >= 1e6) {
    return (n / 1e6).toFixed(1) + "M";
  }
  if (n >= 1e3) {
    return (n / 1e3).toFixed(1) + "K";
  }
  return String(n || 0);
}

function pretty(name) {
  return name
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function svgIcon(name) {
  return `<svg class="ico"><use href="#${name}"/></svg>`;
}


/* ---------- 3. GitHub API (with a small browser cache) ---------- */

async function gh(path, ttl = 300) {
  const key = "noon:" + path;
  let old = null;

  try {
    old = JSON.parse(localStorage.getItem(key));
    if (old && Date.now() - old.t < ttl * 1000) {
      return old.d;
    }
  } catch {
    old = null;
  }

  try {
    const res = await fetch(API + path, {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (res.status === 404 || res.status === 409) {
      return null;
    }
    if (!res.ok) {
      throw new Error(res.status);
    }

    const data = await res.json();
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
    } catch {
      /* storage full or blocked: ignore */
    }
    return data;
  } catch (error) {
    if (old) {
      return old.d;
    }
    throw error;
  }
}


/* ---------- 4. Building apps from releases ---------- */

/* "SY-ai-v1.2-arm64-release.apk" -> "sy-ai" (the app identity) */
function stem(fileName) {
  const abiWords = /(arm64[-_]?v8a|armeabi[-_]?v7a|armeabi|x86[-_]?64|x86|universal|release|debug|signed|unsigned|aligned)/g;
  const versions = /v?\d+(\.\d+)+\w*/g;

  return fileName
    .replace(/\.apk$/i, "")
    .toLowerCase()
    .replace(abiWords, "")
    .replace(versions, "")
    .replace(/[-_.\s]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
}

function build(repo, release, apkFiles, key) {
  const images = (release.assets || []).filter((a) => /\.(png|jpe?g|webp)$/i.test(a.name));
  const mine = key ? images.filter((a) => a.name.toLowerCase().includes(key)) : images;
  const isShot = (a) => /(screen|shot)/i.test(a.name);

  const icon =
    mine.find((a) => /(icon|logo)/i.test(a.name)) ||
    (key && mine.find((a) => !isShot(a)));

  const shots = mine
    .filter(isShot)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((a) => a.browser_download_url);

  const hasLicense = repo.license && repo.license.spdx_id !== "NOASSERTION";
  const hasVersion = release.name && release.name !== "latest";

  return {
    repo: repo.name,
    key: key || "",
    name: pretty(key || repo.name),
    desc: key ? "" : repo.description || "",
    icon: icon ? icon.browser_download_url : "",
    branch: repo.default_branch || "HEAD",
    shots: shots,
    apk: apkFiles.map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      dl: a.download_count
    })),
    notes: release.body || "",
    updated: release.published_at || release.created_at,
    dl: apkFiles.reduce((sum, a) => sum + a.download_count, 0),
    size: apkFiles[0].size,
    license: hasLicense ? repo.license.spdx_id : "",
    stars: repo.stargazers_count,
    url: repo.html_url,
    lang: repo.language,
    ver: hasVersion ? release.name : ""
  };
}

function historyOf(releases, id) {
  return releases
    .filter((r) => !r.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at))
    .map((r) => {
      const files = (r.assets || []).filter((a) => /\.apk$/i.test(a.name) && stem(a.name) === id);
      return {
        tag: r.tag_name,
        name: r.name || r.tag_name,
        date: r.published_at || r.created_at,
        notes: r.body || "",
        files: files.map((a) => ({
          name: a.name,
          url: a.browser_download_url,
          size: a.size,
          dl: a.download_count
        }))
      };
    })
    .filter((h) => h.files.length)
    .slice(0, 10);
}

/* One repository can hold one app, or several apps (one per APK name). */
function collect(repo, releases, all = releases) {
  const newestFirst = releases
    .filter((r) => !r.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));

  const found = new Map();

  for (const release of newestFirst) {
    const groups = {};
    const apkFiles = (release.assets || []).filter((a) => /\.apk$/i.test(a.name));

    for (const file of apkFiles) {
      const id = stem(file.name);
      groups[id] = groups[id] || [];
      groups[id].push(file);
    }

    for (const id in groups) {
      if (!found.has(id)) {
        found.set(id, { release: release, files: groups[id] });
      }
    }
  }

  const isMulti = found.size > 1;
  return [...found].map(([id, hit]) => {
    const app = build(repo, hit.release, hit.files, isMulti ? id : "");
    app.history = historyOf(all, id);
    return app;
  });
}

async function getRepoApps(repo) {
  const releases = (await gh(`/repos/${USER}/${repo.name}/releases?per_page=30`, 300)) || [];

  const latest = releases.find(
    (r) => !r.draft && /^latest$/i.test(r.tag_name) && (r.assets || []).some((a) => /\.apk$/i.test(a.name))
  );

  return collect(repo, latest ? [latest] : releases, releases);
}

/* Finds the icon and screenshots inside the repository (single-app repos only). */
async function enrich(app) {
  if (app.key) {
    return app;
  }

  try {
    const tree = await gh(`/repos/${USER}/${app.repo}/git/trees/${app.branch}?recursive=1`, 1800);
    const files = ((tree && tree.tree) || [])
      .filter((f) => f.type === "blob" && !/node_modules|\/build\//i.test(f.path))
      .map((f) => f.path);

    const raw = (path) =>
      `https://raw.githubusercontent.com/${USER}/${app.repo}/${app.branch}/` +
      path.split("/").map(encodeURIComponent).join("/");

    if (!app.icon) {
      const density = { xxxhdpi: 5, xxhdpi: 4, xhdpi: 3, hdpi: 2, mdpi: 1 };

      const score = (path) => {
        const p = path.toLowerCase();
        if (/(^|\/)(icon|logo|app[-_]?icon)\.(png|webp|jpe?g)$/.test(p)) {
          return 100 - p.split("/").length;
        }
        if (/fastlane\/metadata\/android\/[^/]+\/images\/icon\.(png|jpe?g)$/.test(p)) {
          return 90;
        }
        const m = p.match(/res\/mipmap-(\w+)\/ic_launcher(_round|_foreground)?\.(png|webp)$/);
        if (m) {
          const base = m[2] ? (m[2] === "_round" ? 50 : 30) : 70;
          return base + (density[m[1]] || 0);
        }
        return 0;
      };

      const best = files
        .map((path) => [score(path), path])
        .sort((a, b) => b[0] - a[0])[0];

      if (best && best[0] > 0) {
        app.icon = raw(best[1]);
      }
    }

    if (!app.shots.length) {
      app.shots = files
        .filter((p) => /(^|\/)(screenshots?|phonescreenshots)\/[^/]+\.(png|jpe?g|webp)$/i.test(p))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .slice(0, 8)
        .map(raw);
    }
  } catch {
    /* icon and screenshots are optional */
  }

  return app;
}


/* ---------- 5. Loading data (snapshot first, live API as backup) ---------- */

let snapshotPromise = null;

/* data/apps.json is created by the "Update apps.json" workflow. */
function loadSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetch(SNAPSHOT_URL, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && Array.isArray(data.apps) ? data : null))
      .catch(() => null);
  }
  return snapshotPromise;
}

async function loadAppsLive() {
  const repos = ((await gh(`/users/${USER}/repos?per_page=100&sort=pushed`, 300)) || []).filter((r) => !r.fork);
  let failed = 0;

  const lists = await Promise.all(
    repos.map(async (repo) => {
      try {
        return await Promise.all((await getRepoApps(repo)).map(enrich));
      } catch {
        failed++;
        return [];
      }
    })
  );

  loadApps.failed = failed;
  return lists.flat().sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

async function loadApps() {
  loadApps.failed = 0;
  const snapshot = await loadSnapshot();

  if (snapshot && snapshot.apps.length) {
    return snapshot.apps;
  }
  return loadAppsLive();
}

async function loadRepos() {
  const snapshot = await loadSnapshot();

  if (snapshot && Array.isArray(snapshot.repos) && snapshot.repos.length) {
    return snapshot.repos;
  }
  return (await gh(`/users/${USER}/repos?per_page=100&sort=pushed`)) || [];
}

async function findApp(repoName, key = "") {
  const snapshot = await loadSnapshot();

  if (snapshot) {
    const hit = snapshot.apps.find((a) => a.repo === repoName && a.key === key);
    if (hit) {
      return hit;
    }
  }

  const repo = await gh(`/repos/${USER}/${encodeURIComponent(repoName)}`, 300);
  if (!repo) {
    return null;
  }

  const apps = await getRepoApps(repo);
  const app = apps.find((a) => a.key === key) || apps[0];
  return app ? enrich(app) : null;
}


/* ---------- 6. UI pieces ---------- */

function icon(app, size) {
  const gradients = [
    "linear-gradient(135deg,#FFB23E,#ff8f5a)",
    "linear-gradient(135deg,#B892FF,#8fa8ff)",
    "linear-gradient(135deg,#5EEAD4,#a5f3c2)"
  ];
  const seed = [...app.repo].reduce((sum, c) => sum + c.charCodeAt(0), 0);

  const image = app.icon
    ? `<img src="${esc(app.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : "";

  return `
    <span class="ic" style="--g:${gradients[seed % 3]};--s:${size}px">
      <b>${esc(app.name[0])}</b>
      ${image}
    </span>`;
}

function appCard(app) {
  const keyPart = app.key ? "&k=" + encodeURIComponent(app.key) : "";
  const href = `app.html?app=${encodeURIComponent(app.repo)}${keyPart}`;

  return `
    <a class="card glass" href="${href}" aria-label="${esc(app.name)}">
      ${icon(app, 76)}
      <b>${esc(app.name)}</b>
      <span class="m">${fmtSize(app.size)} · ${fmtNum(app.dl)} downloads</span>
    </a>`;
}


/* ---------- 7. Page layout: header and footer ---------- */

const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="gh" viewBox="0 0 24 24">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
    <path d="M9 18c-4.5 2-5-2-7-2"/>
  </symbol>
  <symbol id="dl" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </symbol>
  <symbol id="search" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </symbol>
  <symbol id="sun" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
  </symbol>
  <symbol id="star" viewBox="0 0 24 24">
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.7 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>
  </symbol>
  <symbol id="back" viewBox="0 0 24 24">
    <path d="M19 12H5M11 18l-6-6 6-6"/>
  </symbol>
</svg>`;

const HEADER = `
<header class="nav">
  <nav class="glass" aria-label="Main">
    <a class="logo" href="index.html">
      <i>${svgIcon("sun")}</i>
      NOON Store
    </a>
    <div class="links">
      <a href="index.html" data-p="store">Store</a>
      <a href="repos.html" data-p="repos">Repositories</a>
    </div>
    <a class="btn btn-glass glass sm" href="https://github.com/${USER}" rel="noopener" aria-label="${USER} on GitHub">
      ${svgIcon("gh")}
      <span class="gname">${USER}</span>
    </a>
  </nav>
</header>`;

const FOOTER = `
<footer>
  <div class="wrap">
    <div class="glass">
      <div>
        <b>© 2026 Muhammad Hamra. All rights reserved.</b>
        <br>
        Apps are downloaded straight from GitHub releases at github.com/${USER}.
      </div>
      <ul>
        <li><a href="repos.html">Repositories</a></li>
        <li><a href="https://github.com/${USER}" rel="noopener">GitHub</a></li>
        <li><a href="privacy.html">Privacy policy</a></li>
        <li><a href="terms.html">Terms of use</a></li>
        <li><a href="https://github.com/${USER}" rel="noopener">Contact</a></li>
      </ul>
    </div>
  </div>
</footer>`;

document.body.insertAdjacentHTML("afterbegin", SPRITE + HEADER);
document.body.insertAdjacentHTML("beforeend", FOOTER);

const currentPage = document.body.dataset.page;
if (currentPage) {
  const link = $(`.links [data-p="${currentPage}"]`);
  if (link) {
    link.classList.add("on");
  }
}
