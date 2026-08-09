// src/components/PrayerQrScannerModal.jsx
// Camera scanner for Closet Prayer QR transfers. Camera use is limited to this modal.

import React, { useEffect, useRef, useState } from 'react';
import decodeQR from 'qr/decode.js';
import {
  collectQrShareFrame,
  decodeQrShareAssembly,
  importPrayerSharePayload,
} from '../utils/qrShare';

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No usable camera was found on this device.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'The camera could not be opened. Another app may already be using it.';
  }
  return error?.message || 'The camera could not be started.';
}

function createNativeQrDetector() {
  if (typeof globalThis.BarcodeDetector !== 'function') return null;

  try {
    return new globalThis.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

export default function PrayerQrScannerModal({ onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const assemblyRef = useRef(null);
  const processingRef = useRef(false);
  const lastScanAtRef = useRef(0);
  const lastRawRef = useRef('');
  const barcodeDetectorRef = useRef(null);
  const scanInFlightRef = useRef(false);
  const scanGenerationRef = useRef(0);

  const [cameraState, setCameraState] = useState('idle');
  const [status, setStatus] = useState('Point the camera at a Closet Prayer sharing QR code.');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [importResult, setImportResult] = useState(null);

  function stopCamera() {
    scanGenerationRef.current += 1;
    scanInFlightRef.current = false;
    barcodeDetectorRef.current = null;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }

    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function finishAssembly(assembly) {
    processingRef.current = true;
    setCameraState('importing');
    setStatus('QR transfer complete. Importing…');
    stopCamera();

    try {
      const payload = await decodeQrShareAssembly(assembly);
      const result = await importPrayerSharePayload(payload);
      const meta = payload.qrShare || {};
      setImportResult({
        result,
        prayerName: meta.prayerName || 'Prayer request',
        requestorName: meta.requestorName || 'Shared Requestor',
        categoryName: meta.categoryName || 'Shared Prayers',
      });
      setCameraState('success');
      setError('');
      setStatus('Prayer imported successfully.');
    } catch (err) {
      console.error('QR import failed:', err);
      assemblyRef.current = null;
      setProgress({ received: 0, total: 0 });
      setCameraState('error');
      setError(err?.message || 'The QR transfer could not be imported.');
      setStatus('Import failed.');
    } finally {
      processingRef.current = false;
    }
  }

  async function acceptDecodedText(rawText) {
    if (processingRef.current) return;

    let collected;
    try {
      collected = collectQrShareFrame(assemblyRef.current, rawText);
    } catch (err) {
      setError(err?.message || 'This QR code is not a supported Closet Prayer share.');
      return;
    }

    assemblyRef.current = collected.assembly;
    setError('');
    setProgress({ received: collected.received, total: collected.total });

    if (collected.complete) {
      await finishAssembly(collected.assembly);
      return;
    }

    setStatus(`Scanning transfer… ${collected.received} of ${collected.total} frames received.`);
  }

  async function decodeCanvasFrame(canvas, context, width, height) {
    const nativeDetector = barcodeDetectorRef.current;

    if (nativeDetector) {
      try {
        const barcodes = await nativeDetector.detect(canvas);
        const detectedQr = barcodes.find(
          (barcode) => barcode.format === 'qr_code' && barcode.rawValue
        );
        if (detectedQr) return detectedQr.rawValue;
      } catch {
        // Some browsers expose BarcodeDetector without QR support.
        barcodeDetectorRef.current = null;
      }
    }

    const imageData = context.getImageData(0, 0, width, height);
    return decodeQR(
      {
        width,
        height,
        data: imageData.data,
      },
      { cropToSquare: true }
    );
  }

  function scanLoop(timestamp) {
    animationRef.current = requestAnimationFrame(scanLoop);

    if (
      processingRef.current ||
      scanInFlightRef.current ||
      timestamp - lastScanAtRef.current < 160
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;

    lastScanAtRef.current = timestamp;

    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const scanGeneration = scanGenerationRef.current;
    scanInFlightRef.current = true;

    void (async () => {
      try {
        const rawText = await decodeCanvasFrame(canvas, context, width, height);
        if (
          scanGeneration !== scanGenerationRef.current ||
          !rawText ||
          rawText === lastRawRef.current
        ) {
          return;
        }

        lastRawRef.current = rawText;
        window.setTimeout(() => {
          if (lastRawRef.current === rawText) lastRawRef.current = '';
        }, 450);

        await acceptDecodedText(rawText);
      } catch {
        // A frame without a readable QR code is expected; keep scanning.
      } finally {
        if (scanGeneration === scanGenerationRef.current) {
          scanInFlightRef.current = false;
        }
      }
    })();
  }

  async function startCamera() {
    stopCamera();
    assemblyRef.current = null;
    setProgress({ received: 0, total: 0 });
    setImportResult(null);
    setError('');
    setStatus('Starting camera…');

    if (!window.isSecureContext) {
      setCameraState('error');
      setStatus('Secure connection required.');
      setError(
        'Camera scanning requires HTTPS (or localhost). A phone opening the Vite dev server through a LAN http:// address is not a secure browser context. Use the deployed HTTPS app or serve the local build through a trusted HTTPS URL.'
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setError(
        'Camera access is unavailable in this browser context. Confirm that this page is using HTTPS and that camera permission is allowed for the site.'
      );
      return;
    }

    try {
      setCameraState('starting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      barcodeDetectorRef.current = createNativeQrDetector();
      setCameraState('scanning');
      setStatus('Point the camera at the sharing QR code.');
      animationRef.current = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Camera start failed:', err);
      stopCamera();
      setCameraState('error');
      setError(cameraErrorMessage(err));
      setStatus('Camera unavailable.');
    }
  }

  function resetScanner() {
    assemblyRef.current = null;
    setProgress({ received: 0, total: 0 });
    setImportResult(null);
    setError('');
    setStatus('Point the camera at a Closet Prayer sharing QR code.');
    setCameraState('idle');
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Scan Closet Prayer QR share"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
        aria-label="Close QR scanner"
      />

      <div className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Scan Prayer QR</h2>
            <p className="text-xs text-gray-400">Automatic Merge Import</p>
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
          {cameraState === 'success' && importResult ? (
            <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4">
              <h3 className="text-lg font-semibold text-emerald-300">Imported</h3>
              <p className="mt-2 text-sm text-gray-200">
                <strong>{importResult.prayerName}</strong> was merged under{' '}
                <strong>{importResult.categoryName}</strong> →{' '}
                <strong>{importResult.requestorName}</strong>.
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Required category or requestor records were created automatically when needed.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={resetScanner}
                  className="flex-1 rounded bg-gray-700 px-3 py-2 text-white hover:bg-gray-600"
                >
                  Scan another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[3/4] max-h-[62vh] w-full object-cover sm:aspect-video"
                />
                <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
              </div>

              <div className="mt-3 rounded-lg bg-gray-800 p-3">
                <p className="text-sm text-gray-200">{status}</p>
                {progress.total > 1 && (
                  <div className="mt-2">
                    <div className="mb-1 flex justify-between text-xs text-gray-400">
                      <span>Frames received</span>
                      <span>{progress.received} / {progress.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-gray-700">
                      <div
                        className="h-full bg-yellow-500 transition-all"
                        style={{
                          width: `${Math.round(
                            (progress.received / progress.total) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <p className="mt-3 text-xs text-gray-400">
                Camera access is used only for QR sharing. Frames are processed locally in this app and are not uploaded or stored. Camera access requires a secure HTTPS context; LAN HTTP development URLs cannot request camera permission on mobile browsers.
              </p>

              <div className="mt-4 flex gap-2">
                {cameraState !== 'scanning' && cameraState !== 'starting' && cameraState !== 'importing' && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex-1 rounded bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    {cameraState === 'error' ? 'Try camera again' : 'Start camera'}
                  </button>
                )}
                {cameraState === 'scanning' && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setCameraState('idle');
                      setStatus('Scanner paused.');
                    }}
                    className="flex-1 rounded bg-gray-700 px-4 py-3 text-white hover:bg-gray-600"
                  >
                    Stop camera
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
