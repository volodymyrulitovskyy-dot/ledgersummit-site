import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const CASE_STUDY_FILES = fs
  .readdirSync(ROOT)
  .filter((name) => /^case-study-.*\.html$/.test(name));

const LEGAL_FILES = ["privacy.html", "terms.html"];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function write(file, contents) {
  fs.writeFileSync(path.join(ROOT, file), contents);
}

function pick(input, regex, label) {
  const match = input.match(regex);
  if (!match) {
    throw new Error(`Could not find ${label}`);
  }
  return match[1].trim();
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function footerHtml() {
  return `  <footer class="site-footer">
    <div class="container footer-shell">
      <p>2026 Ledger Summit. All rights reserved.</p>
      <nav class="footer-nav" aria-label="Footer navigation">
        <a href="index.html#services">Services</a>
        <a href="index.html#engagement">Engagement</a>
        <a href="index.html#cases">Case studies</a>
        <a href="privacy.html">Privacy</a>
        <a href="terms.html">Terms</a>
      </nav>
    </div>
  </footer>`;
}

function pageHead({ title, description, canonicalPath, robots = "index,follow" }) {
  const canonicalUrl = `https://ledgersummit.com/${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="https://ledgersummit.com/assets/og-home.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://ledgersummit.com/assets/og-home.jpg">
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
  <link rel="shortcut icon" href="assets/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/subpages.css">
</head>`;
}

function headerHtml() {
  return `  <a href="#main" class="skip-link">Skip to main content</a>
  <header class="site-header">
    <div class="container site-nav">
      <a class="site-brand" href="index.html" aria-label="Ledger Summit home">
        <img src="assets/logo-ledger-summit.svg" alt="Ledger Summit">
      </a>
      <nav class="site-nav-links" aria-label="Primary navigation">
        <a class="nav-link" href="index.html#services">Services</a>
        <a class="nav-link" href="index.html#engagement">Engagement</a>
        <a class="nav-link" href="index.html#cases">Case studies</a>
        <a class="btn btn-soft" href="index.html#cases">Back to case studies</a>
        <a class="btn btn-primary" href="index.html#book">Book a free call</a>
      </nav>
    </div>
  </header>`;
}

function transformCaseStudy(file) {
  const html = read(file);
  const title = pick(html, /<title>(.*?)<\/title>/s, "title");
  const description = pick(
    html,
    /<meta name="description" content="(.*?)">/s,
    "meta description"
  );
  const eyebrow = pick(
    html,
    /<span class="eyebrow">(.*?)<\/span>/s,
    "eyebrow"
  );
  const h1 = pick(html, /<h1>(.*?)<\/h1>/s, "h1");
  const leadMatches = [...html.matchAll(/<p class="lead"(?: style="[^"]*")?>([\s\S]*?)<\/p>/g)];
  const intro = leadMatches[0]?.[1]?.trim() ?? "";
  const profile = leadMatches[1]?.[1]?.trim() ?? "";
  const metrics = pick(
    html,
    /<div class="summary">([\s\S]*?)<\/div>\s*<\/section>/s,
    "summary"
  );
  const ctaMatch = html.match(
    /<div class="cta">\s*<p>([\s\S]*?)<\/p>\s*<a class="btn btn-primary" href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/s
  );
  if (!ctaMatch) {
    throw new Error(`Could not find CTA in ${file}`);
  }

  const sectionMatches = [...html.matchAll(/<section class="section">([\s\S]*?)<\/section>/g)];
  const cards = sectionMatches.map((match) => {
    const sectionInner = match[1];
    const heading = pick(sectionInner, /<h2>(.*?)<\/h2>/s, "section heading");
    const paragraphMatch = sectionInner.match(/<p>([\s\S]*?)<\/p>/s);
    const paragraph = paragraphMatch ? paragraphMatch[1].trim() : "";
    const listMatch = sectionInner.match(/<ul class="list">([\s\S]*?)<\/ul>/s);
    const tableMatch = sectionInner.match(/<table>([\s\S]*?)<\/table>/s);
    const isResults = /measured results/i.test(heading);
    const isTimeline = /implementation timeline/i.test(heading);
    const id = slugify(heading);
    const cardClass = isResults || isTimeline ? "story-card story-wide" : "story-card";
    const body = [];

    if (paragraph) {
      body.push(`<p>${paragraph}</p>`);
    }
    if (listMatch) {
      body.push(`<ul>${listMatch[1].trim()}</ul>`);
    }
    if (tableMatch) {
      body.push(`<div class="table-wrap"><table>${tableMatch[1].trim()}</table></div>`);
    }

    return `        <article class="${cardClass}" id="${id}">
          <h2>${heading}</h2>
          ${body.join("\n          ")}
        </article>`;
  });

  const jumpTargets = sectionMatches
    .map((match) => pick(match[1], /<h2>(.*?)<\/h2>/s, "section heading"))
    .slice(0, 4)
    .map((heading) => {
      const id = slugify(heading);
      return `            <a class="jump-link" href="#${id}">${heading}</a>`;
    })
    .join("\n");

  const page = `${pageHead({
    title,
    description,
    canonicalPath: file,
  })}
<body class="ls-subpage">
${headerHtml()}
  <main id="main" class="subpage-main">
    <section class="subpage-hero">
      <div class="container hero-shell">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <span class="eyebrow">${eyebrow}</span>
              <h1>${h1}</h1>
            </div>
            <p class="lead">${intro}</p>
            <div class="hero-profile">${profile}</div>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#measured-results">See measured results</a>
              <a class="btn btn-soft" href="index.html#book">Talk through your workflow</a>
            </div>
            <div class="jump-links">
${jumpTargets}
            </div>
          </div>
          <aside class="hero-panel">
            <span class="panel-label">Measured impact</span>
            <p class="panel-copy">Every case study follows the same Ledger Summit transition model: document the current SOP, automate one workflow at a time, and keep independent controls around what gets posted.</p>
            <div class="metric-grid">
${metrics
  .replace(/<article class="metric">/g, '<article class="metric-card">')
  .trim()}
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="subpage-section">
      <div class="container">
        <div class="section-intro">
          <span class="eyebrow">Case study breakdown</span>
          <h2>How the workflow changed from manual effort to controlled automation</h2>
          <p>These pages now follow the same Ledger Summit story structure as the main site: context first, implementation detail second, measured results third, and controls throughout.</p>
        </div>
        <div class="story-grid">
${cards.join("\n")}
        </div>
      </div>
    </section>

    <section class="subpage-cta">
      <div class="container">
        <div class="cta-shell">
          <div>
            <h2>Want a workflow like this on your roadmap?</h2>
            <p>${ctaMatch[1].trim()}</p>
          </div>
          <a class="btn btn-primary" href="${ctaMatch[2]}">${ctaMatch[3].trim()}</a>
        </div>
      </div>
    </section>
  </main>
${footerHtml()}
</body>
</html>`;

  write(file, page);
}

function transformLegal(file) {
  const html = read(file);
  const title = pick(html, /<title>(.*?)<\/title>/s, "title");
  const h1 = pick(html, /<h1>(.*?)<\/h1>/s, "h1");
  const updated = pick(html, /<p class="updated">(.*?)<\/p>/s, "updated text");
  const sectionMatches = [...html.matchAll(/<h2>(.*?)<\/h2>\s*([\s\S]*?)(?=<h2>|<\/div>)/g)];
  const cards = sectionMatches
    .map((match) => {
      const heading = match[1].trim();
      const content = match[2].trim();
      return `        <article class="legal-card" id="${slugify(heading)}">
          <h2>${heading}</h2>
          ${content}
        </article>`;
    })
    .join("\n");

  const description =
    file === "privacy.html"
      ? "Read how Ledger Summit handles account information, connected financial data, and privacy protections."
      : "Review the terms that govern Ledger Summit services, connected integrations, and use of the platform.";

  const page = `${pageHead({
    title,
    description,
    canonicalPath: file,
    robots: "noindex,follow",
  })}
<body class="ls-subpage">
  <a href="#main" class="skip-link">Skip to main content</a>
  <header class="site-header">
    <div class="container site-nav">
      <a class="site-brand" href="index.html" aria-label="Ledger Summit home">
        <img src="assets/logo-ledger-summit.svg" alt="Ledger Summit">
      </a>
      <nav class="site-nav-links" aria-label="Primary navigation">
        <a class="nav-link" href="index.html#services">Services</a>
        <a class="nav-link" href="index.html#cases">Case studies</a>
        <a class="btn btn-soft" href="index.html">Back home</a>
        <a class="btn btn-primary" href="index.html#book">Book a free call</a>
      </nav>
    </div>
  </header>
  <main id="main" class="subpage-main">
    <section class="subpage-hero legal-hero">
      <div class="container hero-shell">
        <div class="hero-grid">
          <div class="hero-copy">
            <div>
              <span class="eyebrow">Legal information</span>
              <h1>${h1}</h1>
            </div>
            <p class="lead">${description}</p>
            <div class="hero-profile"><strong>${updated}</strong></div>
          </div>
          <aside class="hero-panel">
            <span class="panel-label">What is on this page</span>
            <p class="panel-copy">This page uses the same Ledger Summit presentation system as the rest of the site, while keeping the legal text clear, readable, and easy to scan.</p>
            <div class="metric-grid">
              <article class="metric-card">
                <strong>${sectionMatches.length}</strong>
                <span>Sections organized into readable cards</span>
              </article>
              <article class="metric-card">
                <strong>Fast scan</strong>
                <span>Sticky header, spacious layout, and clearer section hierarchy</span>
              </article>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="subpage-section">
      <div class="container legal-shell">
${cards}
      </div>
    </section>
  </main>
${footerHtml()}
</body>
</html>`;

  write(file, page);
}

for (const file of CASE_STUDY_FILES) {
  transformCaseStudy(file);
}

for (const file of LEGAL_FILES) {
  transformLegal(file);
}

console.log(`Rebuilt ${CASE_STUDY_FILES.length} case-study pages and ${LEGAL_FILES.length} legal pages.`);
