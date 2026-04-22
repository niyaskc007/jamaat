import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Button, Space, Tooltip } from 'antd';
import { BoldOutlined, ItalicOutlined, LinkOutlined, OrderedListOutlined, UnorderedListOutlined, UndoOutlined, RedoOutlined } from '@ant-design/icons';

/**
 * Thin wrapper over TipTap that edits HTML. The Text-section renderer stores whatever this
 * component outputs into `body`; the renderer uses a lightweight HTML sanitiser equivalent
 * (CSS-scoped `<div dangerouslySetInnerHTML>`) to display. Inline formatting only —
 * no images, no tables, no code blocks, to keep the design aesthetic consistent.
 */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noreferrer' } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  const promptLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div style={{ border: '1px solid #D9D9D9', borderRadius: 6, background: '#FFF' }}>
      <div style={{ padding: 6, borderBlockEnd: '1px solid #F0F0F0', background: '#FAFAFA', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Space.Compact>
          <Tooltip title="Bold"><Button size="small" type={editor.isActive('bold') ? 'primary' : 'default'} icon={<BoldOutlined />} onClick={() => editor.chain().focus().toggleBold().run()} /></Tooltip>
          <Tooltip title="Italic"><Button size="small" type={editor.isActive('italic') ? 'primary' : 'default'} icon={<ItalicOutlined />} onClick={() => editor.chain().focus().toggleItalic().run()} /></Tooltip>
        </Space.Compact>
        <Space.Compact>
          <Tooltip title="Heading 2"><Button size="small" type={editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button></Tooltip>
          <Tooltip title="Heading 3"><Button size="small" type={editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Button></Tooltip>
        </Space.Compact>
        <Space.Compact>
          <Tooltip title="Bulleted list"><Button size="small" type={editor.isActive('bulletList') ? 'primary' : 'default'} icon={<UnorderedListOutlined />} onClick={() => editor.chain().focus().toggleBulletList().run()} /></Tooltip>
          <Tooltip title="Numbered list"><Button size="small" type={editor.isActive('orderedList') ? 'primary' : 'default'} icon={<OrderedListOutlined />} onClick={() => editor.chain().focus().toggleOrderedList().run()} /></Tooltip>
          <Tooltip title="Quote"><Button size="small" type={editor.isActive('blockquote') ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleBlockquote().run()}>"</Button></Tooltip>
        </Space.Compact>
        <Space.Compact>
          <Tooltip title="Link"><Button size="small" icon={<LinkOutlined />} onClick={promptLink} /></Tooltip>
        </Space.Compact>
        <Space.Compact>
          <Tooltip title="Undo"><Button size="small" icon={<UndoOutlined />} onClick={() => editor.chain().focus().undo().run()} /></Tooltip>
          <Tooltip title="Redo"><Button size="small" icon={<RedoOutlined />} onClick={() => editor.chain().focus().redo().run()} /></Tooltip>
        </Space.Compact>
      </div>
      <EditorContent
        editor={editor}
        style={{ padding: 14, minBlockSize: 180 }}
      />
      <style>{`
        .ProseMirror { outline: none; line-height: 1.65; font-size: 15px; }
        .ProseMirror h2 { font-size: 22px; margin: 18px 0 8px; font-weight: 600; }
        .ProseMirror h3 { font-size: 18px; margin: 16px 0 6px; font-weight: 600; }
        .ProseMirror p { margin: 0 0 10px; }
        .ProseMirror ul, .ProseMirror ol { padding-inline-start: 24px; margin: 0 0 10px; }
        .ProseMirror a { color: var(--jm-primary-500, #0E5C40); text-decoration: underline; }
        .ProseMirror blockquote { border-inline-start: 3px solid #E2E8F0; margin: 0 0 10px; padding-inline-start: 12px; color: #475569; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: 'Start typing…'; color: #94A3B8; pointer-events: none; float: inline-start;
        }
      `}</style>
    </div>
  );
}
