import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  height?: string;
  showFormatButton?: boolean;
};

const JsonEditor = ({
  value,
  onChange,
  placeholder = '{}',
  disabled = false,
  height = '300px',
  showFormatButton = true,
}: JsonEditorProps) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Configure editor options
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on',
      wrappingIndent: 'indent',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnPaste: true,
      formatOnType: true,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
    });

    // Focus editor if not disabled
    if (!disabled) {
      editor.focus();
    }
  };

  const handleFormat = () => {
    if (!editorRef.current || disabled) return;

    setIsFormatting(true);
    try {
      // Parse and format the JSON
      const currentValue = editorRef.current.getValue();
      if (currentValue.trim()) {
        const parsed = JSON.parse(currentValue);
        const formatted = JSON.stringify(parsed, null, 2);
        editorRef.current.setValue(formatted);
        onChange(formatted);
      }
    } catch (error) {
      // If JSON is invalid, just trigger the editor's format action
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    } finally {
      setIsFormatting(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  useEffect(() => {
    if (disabled && editorRef.current) {
      editorRef.current.updateOptions({ readOnly: true });
    } else if (!disabled && editorRef.current) {
      editorRef.current.updateOptions({ readOnly: false });
    }
  }, [disabled]);

  return (
    <div className="space-y-2">
      {showFormatButton && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleFormat}
            disabled={disabled || isFormatting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:bg-brand/5 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFormatting ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                Formatting...
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
                Format JSON
              </>
            )}
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40">
        <Editor
          height={height}
          defaultLanguage="json"
          value={value || placeholder}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme="vs"
          options={{
            readOnly: disabled,
          }}
          onValidate={(markers) => {
            // Optional: Handle validation markers
            console.log('Validation markers:', markers);
          }}
        />
      </div>
    </div>
  );
};

export default JsonEditor;
