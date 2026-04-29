import ReactMarkdown from 'react-markdown';

/// Renders an agreement template's body. Templates are authored in Markdown (headings,
/// bullets, bold) so legal text can have light formatting without HTML. ReactMarkdown
/// never uses dangerouslySetInnerHTML and we don't pass remark-rehype-raw, so any inline
/// HTML in a template is rendered as escaped text - safe by default.
export function AgreementMarkdown({ source }: { source: string }) {
  return (
    <div className="jm-agreement-md" style={{ fontSize: 13, lineHeight: 1.6 }}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: 18, marginBlockStart: 0, marginBlockEnd: 12 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 15, marginBlockStart: 16, marginBlockEnd: 8 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 14, marginBlockStart: 12, marginBlockEnd: 6 }}>{children}</h3>,
          p: ({ children }) => <p style={{ marginBlockStart: 0, marginBlockEnd: 10 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ marginBlockStart: 0, marginBlockEnd: 10, paddingInlineStart: 22 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ marginBlockStart: 0, marginBlockEnd: 10, paddingInlineStart: 22 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBlockEnd: 4 }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
