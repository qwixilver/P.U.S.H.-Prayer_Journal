export function spotlightRect(rect, viewport, padding = 6) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const left = Math.max(viewport.left, rect.left - padding), top = Math.max(viewport.top, rect.top - padding);
  const right = Math.min(viewport.left + viewport.width, rect.right + padding), bottom = Math.min(viewport.top + viewport.height, rect.bottom + padding);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function coachPosition(rect, viewport, height, form = false) {
  const width = Math.min(380, viewport.width - 24), minTop = viewport.top + 12;
  const maxTop = Math.max(minTop, viewport.top + viewport.height - height - 12);
  if (!rect) return { left: viewport.left + (viewport.width - width) / 2, top: Math.max(minTop, viewport.top + (viewport.height - height) / 2), width };
  let top = form ? minTop : rect.bottom + 14;
  if (!form && top + height > viewport.top + viewport.height - 12) top = rect.top - height - 14;
  return { left: Math.max(viewport.left + 12, Math.min(rect.left, viewport.left + viewport.width - width - 12)), top: Math.min(maxTop, Math.max(minTop, top)), width };
}
