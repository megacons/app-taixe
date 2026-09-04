import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect } from 'react';
import api from '@/lib/api';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/* ── Toolbar Button ── */
function TBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = 'Nhập nội dung...', minHeight = 200 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync value từ bên ngoài (khi edit notification cũ)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  const insertImage = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/uploads', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = res.data.data?.url;
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      } catch {
        // silent fail
      }
    };
    input.click();
  }, [editor]);

  const setLink = useCallback(() => {
    const url = window.prompt('Nhập URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {/* Heading */}
        <select
          className="text-xs border border-gray-200 rounded px-1.5 py-1 mr-1 text-gray-600 bg-white"
          value={
            editor.isActive('heading', { level: 1 }) ? '1' :
            editor.isActive('heading', { level: 2 }) ? '2' :
            editor.isActive('heading', { level: 3 }) ? '3' : '0'
          }
          onChange={e => {
            const v = e.target.value;
            if (v === '0') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: Number(v) as 1|2|3 }).run();
          }}
        >
          <option value="0">Đoạn văn</option>
          <option value="1">Tiêu đề 1</option>
          <option value="2">Tiêu đề 2</option>
          <option value="3">Tiêu đề 3</option>
        </select>

        {/* Basic */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strike"><s>S</s></TBtn>

        <span className="mx-1 border-l border-gray-200" />

        {/* List */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">≡</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">1.</TBtn>

        <span className="mx-1 border-l border-gray-200" />

        {/* Align */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">⬅</TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">↔</TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">➡</TBtn>

        <span className="mx-1 border-l border-gray-200" />

        {/* Link + Image */}
        <TBtn onClick={setLink} active={editor.isActive('link')} title="Insert link">🔗</TBtn>
        <TBtn onClick={insertImage} title="Insert image">🖼</TBtn>

        <span className="mx-1 border-l border-gray-200" />

        {/* Quote + HR */}
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">❝</TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">—</TBtn>

        {/* Undo/Redo */}
        <span className="mx-1 border-l border-gray-200" />
        <TBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</TBtn>
      </div>

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 focus:outline-none"
        style={{ minHeight }}
      />

      {/* Tiptap CSS overrides */}
      <style>{`
        .tiptap { outline: none; }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .tiptap img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .tiptap h1 { font-size: 1.5rem; font-weight: 800; margin: 12px 0 6px; }
        .tiptap h2 { font-size: 1.25rem; font-weight: 700; margin: 10px 0 5px; }
        .tiptap h3 { font-size: 1.1rem; font-weight: 600; margin: 8px 0 4px; }
        .tiptap ul { list-style-type: disc; padding-left: 1.5rem; }
        .tiptap ol { list-style-type: decimal; padding-left: 1.5rem; }
        .tiptap blockquote { border-left: 3px solid #163797; padding-left: 12px; color: #6b7280; margin: 8px 0; }
        .tiptap a { color: #163797; text-decoration: underline; }
        .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
      `}</style>
    </div>
  );
}
