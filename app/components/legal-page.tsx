import type { ReactNode } from "react";

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <>
      <style>{LEGAL_PAGE_STYLES}</style>
      <header className="legal-header">
        <a href="/">Standard HTML Sitemap</a>
        <nav aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </header>
      <main className="legal-page">
        <h1>{title}</h1>
        <p className="legal-date">Effective {effectiveDate}</p>
        {children}
      </main>
    </>
  );
}

const LEGAL_PAGE_STYLES = `
  :root { color: #202223; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; }
  .legal-header { align-items: center; border-bottom: 1px solid #dedede; display: flex; justify-content: space-between; padding: 18px max(24px, calc((100% - 760px) / 2)); }
  .legal-header > a { color: #202223; font-weight: 700; text-decoration: none; }
  .legal-header nav { display: flex; gap: 20px; }
  .legal-header nav a, .legal-page a { color: #006fbb; }
  .legal-page { margin: 0 auto; max-width: 760px; padding: 56px 24px 80px; }
  .legal-page h1 { font-size: 36px; line-height: 1.2; margin: 0 0 8px; }
  .legal-page h2 { font-size: 21px; line-height: 1.3; margin: 36px 0 10px; }
  .legal-page p, .legal-page li { font-size: 16px; line-height: 1.65; }
  .legal-page ul { padding-left: 24px; }
  .legal-date { color: #616161; margin-top: 0; }
  @media (max-width: 560px) {
    .legal-header { align-items: flex-start; flex-direction: column; gap: 12px; }
    .legal-page { padding-top: 40px; }
    .legal-page h1 { font-size: 30px; }
  }
`;
