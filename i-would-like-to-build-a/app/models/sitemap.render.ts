import type {
  SitemapConfig,
  SitemapLink,
  SitemapSnapshot,
} from "./sitemap.types";

export const SITEMAP_STYLES = `
.html-sitemap {
  color: var(--html-sitemap-text, #202223);
  padding: var(--html-sitemap-padding, 32px);
  border-radius: 8px;
  font-family: var(--font-body-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}
.html-sitemap--soft { background: color-mix(in srgb, var(--html-sitemap-accent, #007a5c) 7%, transparent); }
.html-sitemap--contrast { background: var(--html-sitemap-text, #202223); color: #fff; }
.html-sitemap__header { margin: 0 0 24px; }
.html-sitemap__title {
  margin: 0;
  color: inherit;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.08;
}
.html-sitemap__updated {
  margin: 8px 0 0;
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 0.95rem;
}
.html-sitemap__grid {
  display: grid;
  grid-template-columns: repeat(var(--html-sitemap-columns, 3), minmax(0, 1fr));
  gap: var(--html-sitemap-gap, 24px);
}
.html-sitemap--compact { --html-sitemap-gap: 16px; --html-sitemap-padding: 20px; }
.html-sitemap--editorial { --html-sitemap-gap: 32px; --html-sitemap-padding: 40px; }
.html-sitemap--spacing-tight { --html-sitemap-gap: 16px; }
.html-sitemap--spacing-roomy { --html-sitemap-gap: 32px; }
.html-sitemap__section {
  min-width: 0;
}
.html-sitemap__section-title {
  align-items: center;
  color: inherit;
  display: flex;
  gap: 10px;
  font-size: 1.2rem;
  line-height: 1.25;
  margin: 0 0 12px;
}
.html-sitemap--heading-small .html-sitemap__section-title { font-size: 1rem; }
.html-sitemap--heading-large .html-sitemap__section-title { font-size: 1.45rem; }
.html-sitemap__count {
  background: var(--html-sitemap-accent, #007a5c);
  border-radius: 999px;
  color: #fff;
  display: inline-block;
  font-size: 0.75rem;
  line-height: 1;
  padding: 5px 8px;
}
.html-sitemap__links {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.html-sitemap__item {
  min-width: 0;
}
.html-sitemap__link {
  color: inherit;
  text-decoration-color: color-mix(in srgb, var(--html-sitemap-accent, #007a5c) 55%, transparent);
  text-underline-offset: 3px;
}
.html-sitemap__link:hover {
  color: var(--html-sitemap-accent, #007a5c);
}
.html-sitemap__link-date {
  color: color-mix(in srgb, currentColor 62%, transparent);
  display: block;
  font-size: 0.82rem;
  margin-top: 2px;
}
.html-sitemap__empty {
  grid-column: 1 / -1;
  margin: 0;
}
@media (max-width: 900px) {
  .html-sitemap__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .html-sitemap { padding: 20px 0; }
  .html-sitemap__grid { grid-template-columns: 1fr; }
}`;

export function renderSitemapMarkup(snapshot: SitemapSnapshot) {
  const { config, manifest, sections } = snapshot;
  const sectionMarkup = sections
    .filter((section) => section.links.length > 0)
    .map((section) => {
      const count = config.showCounts
        ? `<span class="html-sitemap__count">${section.links.length}</span>`
        : "";
      const links = section.links
        .map((link) => renderSitemapLink(link, config.showLastUpdated))
        .join("");

      return `<section class="html-sitemap__section" aria-labelledby="html-sitemap-${section.key}">
        <h2 id="html-sitemap-${section.key}" class="html-sitemap__section-title">${escapeHtml(section.title)}${count}</h2>
        <ul class="html-sitemap__links">${links}</ul>
      </section>`;
    })
    .join("");

  const emptyState =
    sectionMarkup.length === 0
      ? `<p class="html-sitemap__empty">No sitemap links are available yet.</p>`
      : "";

  const updated = config.showLastUpdated
    ? `<p class="html-sitemap__updated">Last updated ${escapeHtml(
        formatDate(manifest.generatedAt),
      )}</p>`
    : "";

  return `<div class="${containerClass(config)}" style="${styleVars(config)}">
    <header class="html-sitemap__header">
      <h1 class="html-sitemap__title">Sitemap</h1>
      ${updated}
    </header>
    <div class="html-sitemap__grid">${sectionMarkup}${emptyState}</div>
  </div>`;
}

export function renderSitemapLiquid(snapshot: SitemapSnapshot) {
  return `{% layout none %}<style>${SITEMAP_STYLES}</style>${renderSitemapMarkup(snapshot)}`;
}

function renderSitemapLink(link: SitemapLink, showLastUpdated: boolean) {
  const updated =
    showLastUpdated && link.updatedAt
      ? `<span class="html-sitemap__link-date">${escapeHtml(
          formatDate(link.updatedAt),
        )}</span>`
      : "";

  return `<li class="html-sitemap__item"><a class="html-sitemap__link" href="${escapeAttribute(
    link.url,
  )}">${escapeHtml(link.title)}</a>${updated}</li>`;
}

function containerClass(config: SitemapConfig) {
  return [
    "html-sitemap",
    `html-sitemap--${config.layout}`,
    `html-sitemap--${config.backgroundMode}`,
    `html-sitemap--heading-${config.headingSize}`,
    `html-sitemap--spacing-${config.spacingDensity}`,
  ].join(" ");
}

function styleVars(config: SitemapConfig) {
  return [
    `--html-sitemap-accent:${config.accentColor}`,
    `--html-sitemap-text:${config.textColor}`,
    `--html-sitemap-columns:${config.columns}`,
  ].join(";");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
