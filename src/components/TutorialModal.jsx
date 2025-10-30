// src/components/TutorialModal.jsx
import React, { useEffect, useState } from 'react';
import slides from '../utils/tutorialSlides';

export default function TutorialModal({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = slides[idx];

  // Escape closes
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isFirst = idx === 0;
  const isLast = idx === slides.length - 1;

  function handlePrimary() {
    if (isLast) {
      onClose?.();
      return;
    }
    setIdx((i) => Math.min(slides.length - 1, i + 1));
  }

  function handleBack() {
    setIdx((i) => Math.max(0, i - 1));
  }

  function handleSecondary() {
    // Close tutorial (mark onboarded) then jump to Settings.
    onClose?.();
    // Hash update for consistency + custom event for immediate nav
    try {
      if (window.location.hash !== '#settings') {
        history.replaceState(null, '', '#settings');
      }
      window.dispatchEvent(new CustomEvent('ui:nav', { detail: 'settings' }));
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tutorial"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* card */}
      <div className="relative z-10 max-w-md w-[92%] bg-gray-900 text-white rounded-xl shadow-lg p-5">
        <h2 className="text-xl font-semibold mb-3">{slide.title}</h2>
        <p className="text-gray-200 mb-6 whitespace-pre-wrap">{slide.body}</p>

        <div className="flex items-center justify-between">
          <button
            className="px-3 py-2 rounded bg-gray-700 disabled:opacity-40"
            onClick={handleBack}
            disabled={isFirst}
          >
            Back
          </button>

          <div className="text-sm text-gray-400">{idx + 1} / {slides.length}</div>

          <button
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700"
            onClick={handlePrimary}
          >
            {slide.cta || (isLast ? 'Finish' : 'Next')}
          </button>
        </div>

        {/* Secondary CTA (link-style), only when provided */}
        {slide.secondaryCta && isLast && (
          <div className="mt-4 text-right">
            <button
              type="button"
              onClick={handleSecondary}
              className="text-sm underline text-gray-300 hover:text-white"
            >
              {slide.secondaryCta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
