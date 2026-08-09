// src/components/QrMatrix.jsx
// Renders a QR code locally as SVG using the bundled qr package.

import React, { useMemo } from 'react';
import encodeQR from 'qr';

export default function QrMatrix({ value, className = '' }) {
  const matrix = useMemo(() => {
    if (!value) return [];
    return encodeQR(value, 'raw', {
      ecc: 'medium',
      encoding: 'byte',
      border: 4,
    });
  }, [value]);

  if (!matrix.length) return null;

  const size = matrix.length;
  let path = '';

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix[y][x]) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Closet Prayer sharing QR code"
      className={`block w-[88vw] max-w-[480px] aspect-square bg-white ${className}`.trim()}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
