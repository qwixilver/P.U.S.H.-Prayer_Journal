// src/components/PrayerQrShareModal.jsx
// Lets a Security-page user choose disclosure depth and display a QR transfer.

import React, { useEffect, useState } from 'react';
import QrMatrix from './QrMatrix';
import {
  createPrayerShareFrames,
  QR_SHARE_SCOPES,
} from '../utils/qrShare';

export default function PrayerQrShareModal({ prayerId, onClose }) {
  const [scope, setScope] = useState('prayer');
  const [transfer, setTransfer] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!transfer || paused || transfer.frames.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % transfer.frames.length);
    }, 650);

    return () => window.clearInterval(timer);
  }, [transfer, paused]);

  useEffect(() => {
    setTransfer(null);
    setFrameIndex(0);
    setPaused(false);
    setError('');
  }, [scope, prayerId]);

  async function handleCreateQr() {
    setWorking(true);
    setError('');

    try {
      const result = await createPrayerShareFrames(prayerId, scope);
      setTransfer(result);
      setFrameIndex(0);
      setPaused(false);
    } catch (err) {
      console.error('Create QR share failed:', err);
      setError(err?.message || 'Unable to create the QR share.');
    } finally {
      setWorking(false);
    }
  }

  const frameCount = transfer?.frames?.length || 0;
  const currentFrame = frameCount ? transfer.frames[frameIndex] : '';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Share prayer by QR code"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
        aria-label="Close QR sharing"
      />

      <div className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Share Prayer</h2>
            <p className="text-xs text-gray-400">QR transfer from the Security page</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {!transfer ? (
            <>
              <p className="mb-3 text-sm text-gray-300">
                Choose how much context to send with this prayer. The receiving app will merge it automatically and create any required parent records.
              </p>

              <div className="space-y-2">
                {Object.entries(QR_SHARE_SCOPES).map(([key, option]) => (
                  <label
                    key={key}
                    className={`block cursor-pointer rounded-lg border p-3 ${
                      scope === key
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-gray-700 bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="qr-share-scope"
                        value={key}
                        checked={scope === key}
                        onChange={() => setScope(key)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-white">{option.label}</div>
                        <div className="mt-1 text-sm text-gray-300">{option.description}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-amber-700/70 bg-amber-950/40 p-3 text-sm text-amber-200">
                QR sharing is an intentional plaintext transfer. Anyone who can scan the displayed code can read the data you chose to share. Private Vault backup encryption is not applied to QR shares.
              </div>

              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

              <button
                type="button"
                onClick={handleCreateQr}
                disabled={working}
                className="mt-4 w-full rounded-lg bg-yellow-500 px-4 py-3 font-semibold text-black hover:bg-yellow-400 disabled:cursor-wait disabled:opacity-60"
              >
                {working ? 'Preparing QR…' : 'Show QR code'}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <div className="mb-3 w-full rounded-lg bg-gray-800 p-3 text-sm text-gray-300">
                <div className="font-semibold text-white">
                  {QR_SHARE_SCOPES[scope].label}
                </div>
                <div className="mt-1">
                  Ask the other user to open <strong>Security → Scan QR</strong> and point their camera at this screen.
                </div>
              </div>

              <div className="rounded-xl bg-white p-2 shadow-lg">
                <QrMatrix value={currentFrame} />
              </div>

              {frameCount > 1 ? (
                <div className="mt-3 w-full text-center">
                  <div className="text-sm font-medium text-gray-200">
                    Animated QR • frame {frameIndex + 1} of {frameCount}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Keep this screen visible. The receiving phone collects the frames automatically in any order.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPaused((value) => !value)}
                      className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
                    >
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaused(true);
                        setFrameIndex((current) =>
                          (current - 1 + frameCount) % frameCount
                        );
                      }}
                      className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaused(true);
                        setFrameIndex((current) => (current + 1) % frameCount);
                      }}
                      className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-400">Single-frame QR share</p>
              )}

              <div className="mt-4 flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => setTransfer(null)}
                  className="flex-1 rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-600"
                >
                  Change sharing level
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
