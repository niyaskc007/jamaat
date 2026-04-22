import { useEffect } from 'react';

type HotkeyModifier = 'alt' | 'ctrl' | 'meta' | 'shift';

type HotkeySpec = {
  /// Single key to match (case-insensitive). For "/" pass "/".
  key: string;
  /// Required modifiers. If omitted, the keypress must have NONE of alt/ctrl/meta
  /// held down so we don't hijack regular typing in inputs (shift is ignored so
  /// things like ? still work).
  modifiers?: HotkeyModifier[];
  /// If true (default), ignore the keypress when focus is on a form field.
  /// Set false for chorded shortcuts like Ctrl+Enter that *should* fire from inputs.
  ignoreInInputs?: boolean;
};

/// Attach a document-level keyboard shortcut. Tailored for the Jamaat cashier flow —
/// enough to add Alt+N, Ctrl+Enter, and "/ focuses search" without a full library.
export function useHotkey(spec: HotkeySpec, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== spec.key.toLowerCase()) return;

      const mods = spec.modifiers ?? [];
      const needsAlt = mods.includes('alt');
      const needsCtrl = mods.includes('ctrl');
      const needsMeta = mods.includes('meta');

      if (needsAlt !== e.altKey) return;
      if (needsCtrl !== e.ctrlKey) return;
      if (needsMeta !== e.metaKey) return;

      const ignoreInInputs = spec.ignoreInInputs ?? true;
      if (ignoreInInputs) {
        const t = e.target as HTMLElement | null;
        if (t && isEditable(t)) return;
      }

      handler(e);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [spec.key, spec.modifiers, spec.ignoreInInputs, handler]);
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  // AntD Select / DatePicker render custom contenteditable shells — check ancestors.
  return !!el.closest('[contenteditable="true"]');
}
