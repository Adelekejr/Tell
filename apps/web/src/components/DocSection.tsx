import type { ReactNode } from "react";

/** A long-page section: heading on the left on desktop, body on the right. Phone: stacked. */
export function DocSection({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="doc-section grid"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <div className="doc-section-head">
        <h2 className="h2" id={`${id}-title`}>
          {title}
        </h2>
        {intro ? <p className="small muted">{intro}</p> : null}
      </div>
      <div className="doc-section-body">{children}</div>
    </section>
  );
}

/** "On this page" links. Each is a 44 px target. */
export function Contents({ items }: { items: [id: string, label: string][] }) {
  return (
    <nav className="contents" aria-label="On this page">
      <p className="label">On this page</p>
      <ol>
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`}>{label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
