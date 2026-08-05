// src/components/DataExportButton.jsx
// Compact reusable control for exporting one portable branch or leaf.

import React, { useEffect, useRef, useState } from 'react';
import { downloadJson, exportSelectionSmart } from '../utils/backup';

export default function DataExportButton({
  kind,
  id,
  label = 'Export',
  className = '',
  title,
}) {
  const [state, setState] = useState('idle');
  const resetTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(resetTimerRef.current);
  }, []);

  async function handleExport() {
    if (state === 'working') return;

    clearTimeout(resetTimerRef.current);
    setState('working');

    try {
      const output = await exportSelectionSmart({ kind, id });
      downloadJson(output.text, output.fileName);
      setState('done');
      resetTimerRef.current = setTimeout(() => setState('idle'), 1600);
    } catch (error) {
      console.error(`Export ${kind} failed:`, error);
      setState('idle');
      window.alert(error?.message || 'Export failed.');
    }
  }

  const buttonText =
    state === 'working' ? 'Exporting…' : state === 'done' ? 'Exported' : label;

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={state === 'working'}
      className={`text-sm px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:cursor-wait disabled:opacity-70 ${className}`.trim()}
      title={title || `Export this ${kind} as a portable database package`}
    >
      {buttonText}
    </button>
  );
}
