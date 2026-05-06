import type { ReactNode } from 'react';

/// Section card used by long forms (operator + portal new-X pages). Replaces the
/// `<Divider orientation="left">Section</Divider>` pattern with an icon-led header,
/// gradient strip, accent border, and a body slot for the form fields.
///
/// All visual rules live in portal.css under .jm-form-section-* (no inline styles -
/// RULES.md §10). One implementation reused across the app per RULES.md §15.
export function FormSection({
  icon, title, help, children,
}: {
  icon?: ReactNode;
  title: string;
  /** Optional small line under the title that explains the section to the member / cashier. */
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="jm-form-section">
      <div className="jm-form-section-head">
        {icon && <span className="jm-form-section-head-icon">{icon}</span>}
        <div className="jm-form-section-head-text">
          <div className="jm-form-section-title-x">{title}</div>
          {help && <div className="jm-form-section-help">{help}</div>}
        </div>
      </div>
      <div className="jm-form-section-body">{children}</div>
    </section>
  );
}

/// Sticky footer that hugs the bottom of a form, showing a short summary on the left
/// (e.g. "Submitting 1,200 INR over 12 monthly instalments") and the primary + cancel
/// actions on the right.
export function FormStickyFooter({
  summary, actions,
}: {
  summary?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="jm-form-sticky-footer">
      <div className="jm-form-sticky-footer-summary">{summary}</div>
      <div>{actions}</div>
    </div>
  );
}
