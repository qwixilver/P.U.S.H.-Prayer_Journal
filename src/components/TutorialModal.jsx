import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import steps from '../utils/tutorialSlides';
import { coachPosition, spotlightRect } from '../utils/tutorialLayout';
import './tutorial.css';

function viewport() {
  const visual = window.visualViewport;
  return { left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
    width: visual?.width || window.innerWidth, height: visual?.height || window.innerHeight };
}

export default function TutorialModal({ onClose, onReplayStep }) {
  const [index, setIndex] = useState(0);
  const [geometry, setGeometry] = useState(() => ({ rect: null, viewport: viewport() }));
  const [panelHeight, setPanelHeight] = useState(260);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [hintOpen, setHintOpen] = useState(null);
  const panel = useRef(null), heading = useRef(null), target = useRef(null);
  const reposition = useRef(null);
  const advancing = useRef(false);
  const callbacks = useRef({ onClose, onReplayStep });
  callbacks.current = { onClose, onReplayStep };
  const step = steps[index];
  const compact = step.form && (hintOpen == null ? geometry.viewport.height < 420 : !hintOpen);
  function advance() {
    if (advancing.current) return;
    advancing.current = true;
    setIndex(current => Math.min(steps.length - 1, current + 1));
  }
  function back() {
    if (!index) return;
    callbacks.current.onReplayStep(steps[index - 1].id);
    setIndex(index - 1);
  }

  useLayoutEffect(() => {
    let previousHeight = panel.current?.getBoundingClientRect().height || 260;
    setPanelHeight(previousHeight);
    const observer = new ResizeObserver(() => {
      const height = panel.current?.getBoundingClientRect().height || 260;
      setPanelHeight(height);
      if (height !== previousHeight) { previousHeight = height; reposition.current?.(); }
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [index, compact]);

  useEffect(() => {
    advancing.current = false; target.current = null; setMissing(false); setHintOpen(null);
    let frame, scrolled = false, docked = false, focused = false, restoreAccess = () => {};
    const workspace = document.querySelector('[data-tutorial-workspace]');
    const originalPadding = document.documentElement.style.scrollPaddingTop;
    const originalWorkspacePadding = workspace?.style.paddingTop;
    document.documentElement.style.scrollPaddingTop = step.form ? `${(panel.current?.offsetHeight || 200) + 24}px` : '24px';
    function restrict(element) {
      restoreAccess();
      const changes = [];
      function disable(node) {
        if (!(node instanceof HTMLElement)) return;
        changes.push([node, node.inert]); node.inert = true;
      }
      if (!element) disable(workspace);
      else {
        if (step.action === 'inspect') disable(element);
        let child = element;
        while (child && child !== workspace) {
          for (const sibling of child.parentElement?.children || []) if (sibling !== child) disable(sibling);
          child = child.parentElement;
        }
      }
      const previousDescription = element?.getAttribute('aria-describedby');
      if (element && step.action !== 'inspect') element.setAttribute('aria-describedby', [previousDescription, 'tutorial-description'].filter(Boolean).join(' '));
      restoreAccess = () => {
        for (const [node, value] of changes) node.inert = value;
        if (element) {
          if (previousDescription == null) element.removeAttribute('aria-describedby');
          else element.setAttribute('aria-describedby', previousDescription);
        }
      };
    }
    restrict(null);
    function measure() {
      frame = null;
      const element = step.target ? workspace?.querySelector(step.target) : null;
      if (element !== target.current) {
        target.current = element; restrict(element); focused = false;
      }
      if (element && !scrolled) {
        scrolled = true;
        const height = panel.current?.offsetHeight || 200;
        element.scrollIntoView({ block: 'center', behavior: 'auto' });
        const bounds = element.getBoundingClientRect(), view = viewport();
        const bottom = workspace?.querySelector('nav')?.getBoundingClientRect().top || view.top + view.height;
        const noRoom = bounds.top - view.top < height + 28 && bottom - bounds.bottom < height + 28;
        docked = Boolean(step.form || (!element.closest('nav') && noRoom));
        if (docked && workspace) {
          workspace.style.paddingTop = `${height + 24}px`;
          document.documentElement.style.scrollPaddingTop = `${height + 24}px`;
          element.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }
      const view = viewport();
      const navigation = workspace?.querySelector('nav')?.getBoundingClientRect();
      const visible = navigation && !element?.closest('nav')
        ? { ...view, height: Math.max(0, Math.min(view.height, navigation.top - view.top - 8)) } : view;
      const next = { rect: spotlightRect(element?.getBoundingClientRect(), visible), viewport: view, docked };
      setGeometry(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      if (element) setMissing(false);
      if (!focused && (!step.target || element)) {
        focused = true;
        if (element?.matches('button, input, select, textarea, a[href]') && step.action === 'click') element.focus({ preventScroll: true });
        else heading.current?.focus({ preventScroll: true });
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = () => {
      // Keep an active text field in place while the on-screen keyboard opens.
      const typing = step.form && target.current?.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
      if (!typing) {
        scrolled = false; docked = false;
        if (workspace) workspace.style.paddingTop = originalWorkspacePadding || '';
      }
      schedule();
    };
    reposition.current = resize;
    const mutations = new MutationObserver(schedule);
    if (workspace) mutations.observe(workspace, { childList: true, subtree: true });
    const sizes = new ResizeObserver(schedule);
    if (workspace) sizes.observe(workspace);
    window.addEventListener('resize', resize);
    document.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', schedule);
    const missingTimer = setTimeout(() => { if (step.target && !target.current) setMissing(true); }, 7000);
    const click = event => {
      if (step.action === 'click' && target.current?.contains(event.target)) advance();
    };
    const write = event => {
      if (step.action === 'write' && event.detail?.table === step.table && event.detail.operation === 'add') advance();
    };
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); callbacks.current.onClose(); return; }
      if (event.key !== 'Tab') return;
      const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
      const allowed = [...panel.current.querySelectorAll(selector)];
      if (step.action === 'inspect') {
        const proxy = document.querySelector('[data-tour-continue]'); if (proxy) allowed.push(proxy);
      } else if (target.current) {
        if (target.current.matches(selector)) allowed.push(target.current);
        allowed.push(...target.current.querySelectorAll(selector));
      }
      const visible = allowed.filter(node => node.getClientRects().length && !node.closest('[inert]'));
      if (!visible.length) return;
      const current = visible.indexOf(document.activeElement);
      event.preventDefault();
      visible[(current + (event.shiftKey ? -1 : 1) + visible.length) % visible.length].focus();
    };
    document.addEventListener('click', click);
    window.addEventListener('tutorial:write', write);
    document.addEventListener('keydown', keyboard, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame); clearTimeout(missingTimer); mutations.disconnect(); sizes.disconnect(); restoreAccess();
      document.documentElement.style.scrollPaddingTop = originalPadding;
      if (workspace) workspace.style.paddingTop = originalWorkspacePadding || '';
      reposition.current = null;
      window.removeEventListener('resize', resize); document.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('click', click); window.removeEventListener('tutorial:write', write); document.removeEventListener('keydown', keyboard, true);
    };
  }, [index, retry]);

  const rect = step.target ? geometry.rect : null;
  const view = geometry.viewport;
  const position = coachPosition(rect, view, panelHeight, step.form || geometry.docked);
  const masks = rect ? [
    { left: 0, top: 0, width: '100%', height: rect.top },
    { left: 0, top: rect.bottom, width: '100%', bottom: 0 },
    { left: 0, top: rect.top, width: rect.left, height: rect.height },
    { left: rect.right, right: 0, top: rect.top, height: rect.height },
  ] : [{ inset: 0 }];
  return createPortal(<div className="tutorial-overlay" data-tutorial-overlay>
    {masks.map((style, key) => <div key={key} className="tutorial-shade" style={style} aria-hidden="true" />)}
    {rect && <div className="tutorial-ring" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} aria-hidden="true" />}
    {rect && step.action === 'inspect' && <button data-tour-continue className="tutorial-inspect" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} onClick={advance} aria-label={`Continue: ${step.title}`} />}
    <section ref={panel} className={`tutorial-coach ${step.form ? 'tutorial-coach-form' : ''}`} style={{ ...position, maxHeight: step.target ? Math.max(100, view.height - 120) : view.height - 24 }} role="dialog" aria-modal={!rect} aria-labelledby="tutorial-heading" aria-describedby="tutorial-description" data-tour-step={step.id}>
      <div className="tutorial-coach-top">{step.form ? <button type="button" onClick={() => setHintOpen(Boolean(compact))} aria-expanded={!compact}>{compact ? 'Show hint' : 'Minimize hint'}</button> : <span>YOUR PRAYER JOURNAL</span>}<button type="button" onClick={() => callbacks.current.onClose()} aria-label="Skip walkthrough">Skip tour</button></div>
      {!compact && <div className="tutorial-progress" aria-hidden="true"><span style={{ width: `${(index + 1) / steps.length * 100}%` }} /></div>}
      <h2 id="tutorial-heading" ref={heading} tabIndex={-1}>{step.title}</h2>
      <p id="tutorial-description" hidden={compact}>{step.body}</p>
      {(missing || (step.target && !rect)) && <div className="tutorial-recovery" role="status">Finding the highlighted control. <button onClick={() => { callbacks.current.onReplayStep(step.id); setRetry(value => value + 1); }}>Show this step again</button></div>}
      <div className="tutorial-coach-footer">
        <button type="button" onClick={back} disabled={!index}>Back</button><span aria-label={`Step ${index + 1} of ${steps.length}`}>{index + 1} / {steps.length}</span>
        {!step.target ? <button className="tutorial-primary" onClick={() => index === steps.length - 1 ? callbacks.current.onClose() : advance()}>{step.cta}</button> : <span className="tutorial-hint">{step.action === 'write' ? 'Save the practice form' : 'Tap the highlighted area'}</span>}
      </div>
      {index === 0 && <button className="tutorial-text-action" onClick={() => callbacks.current.onClose('settings')}>Restore a backup instead</button>}
      {index === steps.length - 1 && <button className="tutorial-text-action" onClick={() => callbacks.current.onClose('categories')}>Finish and create my first category</button>}
    </section>
  </div>, document.body);
}
