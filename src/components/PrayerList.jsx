// src/components/PrayerList.jsx
// Daily/Security list with grouped Daily view, flat Security view,
// prayer events, explicit detail controls, add/edit controls, and PWA actions.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerUpsertModal from './PrayerUpsertModal';
import PrayerEventList from './PrayerEventList';
import PrayerEventForm from './PrayerEventForm';

const DAILY_FILTER_STORAGE_KEY = 'cp:dailyStatusFilters:v1';

function loadDailyStatusFilters() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DAILY_FILTER_STORAGE_KEY) || 'null'
    );

    const showRequested = saved?.showRequested !== false;
    const showAnswered = saved?.showAnswered !== false;

    if (!showRequested && !showAnswered) {
      return { showRequested: true, showAnswered: true };
    }

    return { showRequested, showAnswered };
  } catch {
    return { showRequested: true, showAnswered: true };
  }
}

function isAnsweredPrayer(prayer) {
  return (prayer?.status || '').toLowerCase() === 'answered' || Boolean(prayer?.answeredAt);
}

function fmt(iso) {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString();
}

export default function PrayerList({
  viewType = 'daily',
  isSecurity: isSecurityProp = false,
  onFocusPrayer,
}) {
  const isSecurity = isSecurityProp || viewType === 'security';
  const [categories, setCategories] = useState([]);
  const [requestors, setRequestors] = useState([]);
  const [prayers, setPrayers] = useState([]);
  const [addingEventFor, setAddingEventFor] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [dailyStatusFilters, setDailyStatusFilters] = useState(
    loadDailyStatusFilters
  );

  async function load() {
    setLoading(true);

    try {
      const [categoryRows, requestorRows, prayerRows] = await Promise.all([
        db.categories.toArray(),
        db.requestors.toArray(),
        db.prayers.toArray(),
      ]);

      setCategories(categoryRows);
      setRequestors(requestorRows);

      const filtered = isSecurity
        ? prayerRows.filter((prayer) => Boolean(prayer.security))
        : prayerRows;

      filtered.sort((a, b) => {
        const dateA = a.requestedAt || '';
        const dateB = b.requestedAt || '';
        return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
      });

      setPrayers(filtered);
    } catch (error) {
      console.error('Error loading prayers:', error);
      setPrayers([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [isSecurity]);

  useEffect(() => {
    const onDbChanged = () => load();

    window.addEventListener('db:changed', onDbChanged);
    return () => window.removeEventListener('db:changed', onDbChanged);
  }, [isSecurity]);

  useEffect(() => {
    const openAddPrayer = () => {
      setShowAddForm(true);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    };

    window.addEventListener('ui:addPrayer', openAddPrayer);
    return () => window.removeEventListener('ui:addPrayer', openAddPrayer);
  }, []);

  const categoryById = useMemo(() => {
    const map = new Map();

    for (const category of categories) {
      map.set(category.id, category);
    }

    return map;
  }, [categories]);

  const requestorById = useMemo(() => {
    const map = new Map();

    for (const requestor of requestors) {
      map.set(requestor.id, requestor);
    }

    return map;
  }, [requestors]);

  const visiblePrayers = useMemo(() => {
    if (isSecurity) return prayers;

    return prayers.filter((prayer) => {
      const answered = isAnsweredPrayer(prayer);

      if (answered) return dailyStatusFilters.showAnswered;
      return dailyStatusFilters.showRequested;
    });
  }, [isSecurity, prayers, dailyStatusFilters]);

  const groupedDaily = useMemo(() => {
    if (isSecurity) return null;

    const byCategory = new Map();

    for (const prayer of visiblePrayers) {
      const requestor = requestorById.get(prayer.requestorId);
      const category = requestor
        ? categoryById.get(requestor.categoryId)
        : null;
      const categoryName = category?.name || 'Unassigned';
      const requestorId = requestor?.id ?? -1;

      if (!byCategory.has(categoryName)) {
        byCategory.set(categoryName, new Map());
      }

      const byRequestor = byCategory.get(categoryName);

      if (!byRequestor.has(requestorId)) {
        byRequestor.set(requestorId, []);
      }

      byRequestor.get(requestorId).push(prayer);
    }

    const output = {};

    for (const [categoryName, byRequestor] of byCategory.entries()) {
      const groups = [];

      for (const [requestorId, items] of byRequestor.entries()) {
        const requestor = requestorById.get(requestorId);

        groups.push({
          requestorId,
          requestorName: requestor?.name || 'Unassigned',
          items,
        });
      }

      groups.sort((a, b) =>
        a.requestorName.localeCompare(b.requestorName)
      );
      output[categoryName] = groups;
    }

    return output;
  }, [isSecurity, visiblePrayers, requestorById, categoryById]);

  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

  function updateDailyStatusFilter(filterName, enabled) {
    setDailyStatusFilters((current) => {
      const next = {
        ...current,
        [filterName]: enabled,
      };

      if (!next.showRequested && !next.showAnswered) {
        return current;
      }

      localStorage.setItem(
        DAILY_FILTER_STORAGE_KEY,
        JSON.stringify(next)
      );

      return next;
    });
  }

  function renderStatusToggle({ label, checked, onChange, disabled }) {
    return (
      <label
        className={`inline-flex items-center gap-2 text-sm ${
          disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
        }`}
      >
        <span className="text-gray-200">{label}</span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-label={`Show ${label.toLowerCase()} prayers`}
          />
          <span className="h-6 w-11 rounded-full bg-gray-600 transition peer-checked:bg-yellow-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow-300 peer-disabled:cursor-not-allowed" />
          <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
        </span>
      </label>
    );
  }

  function togglePrayerDetails(prayerId) {
    setExpanded((current) => ({
      ...current,
      [prayerId]: !current[prayerId],
    }));
  }

  function renderEvents(prayer) {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-white font-semibold">Events</h4>
          <button
            type="button"
            className="text-sm px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() =>
              setAddingEventFor((current) => ({
                ...current,
                [prayer.id]: !current[prayer.id],
              }))
            }
          >
            {addingEventFor[prayer.id] ? 'Close' : 'Add event'}
          </button>
        </div>

        {addingEventFor[prayer.id] && (
          <PrayerEventForm
            prayerId={prayer.id}
            onSuccess={() =>
              setAddingEventFor((current) => ({
                ...current,
                [prayer.id]: false,
              }))
            }
            onCancel={() =>
              setAddingEventFor((current) => ({
                ...current,
                [prayer.id]: false,
              }))
            }
          />
        )}

        <PrayerEventList prayerId={prayer.id} allowDelete compact />
      </div>
    );
  }

  function renderPrayerCard(prayer, requestorName, headingLevel = 'h4') {
    const Heading = headingLevel;
    const isExpanded = Boolean(expanded[prayer.id]);
    const requestor = requestorById.get(prayer.requestorId);
    const category = requestor
      ? categoryById.get(requestor.categoryId)
      : null;
    const isFocusEligible = Boolean(category?.showSingle);

    return (
      <li key={prayer.id} className="bg-gray-800 rounded-lg p-3 shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Heading className="text-white font-semibold">
              {prayer.name}
            </Heading>
            <p className="text-gray-300 text-sm line-clamp-2">
              {prayer.description}
            </p>
            <div className="text-gray-400 text-xs mt-1">
              Requestor: {requestorName} • Requested: {fmt(prayer.requestedAt)} • Status: {prayer.status}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => togglePrayerDetails(prayer.id)}
              className="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              aria-expanded={isExpanded}
              aria-controls={`prayer-details-${prayer.id}`}
            >
              {isExpanded ? 'Hide details' : 'Details'}
            </button>
            {isFocusEligible && typeof onFocusPrayer === 'function' && (
              <button
                type="button"
                onClick={() => onFocusPrayer(prayer.id)}
                className="text-sm px-2 py-1 rounded bg-yellow-500 hover:bg-yellow-600 text-black"
                title="Open this request in Focus"
              >
                Focus
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditTarget(prayer)}
              className="text-sm px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
            >
              Edit
            </button>
          </div>
        </div>

        {isExpanded && (
          <div
            id={`prayer-details-${prayer.id}`}
            className="mt-2 text-gray-200 whitespace-pre-wrap"
          >
            {prayer.description}
            {renderEvents(prayer)}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="relative overflow-y-auto p-4 pb-24">
      {showAddForm && (
        <div className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-700 rounded-b-lg shadow-lg -mx-4 px-4 pt-4 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Add Prayer</h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-2 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                title="Minimize"
              >
                Minimize
              </button>
            </div>
            <PrayerForm
              onSuccess={handleAddSuccess}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-2xl font-bold">
          {isSecurity ? 'Security' : 'Daily'} Prayers
        </h2>

        {!isSecurity && (
          <div
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 rounded-lg bg-gray-800 px-3 py-2 shadow"
            aria-label="Daily prayer status filters"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Show
            </span>
            {renderStatusToggle({
              label: 'Requested',
              checked: dailyStatusFilters.showRequested,
              disabled:
                dailyStatusFilters.showRequested &&
                !dailyStatusFilters.showAnswered,
              onChange: (enabled) =>
                updateDailyStatusFilter('showRequested', enabled),
            })}
            {renderStatusToggle({
              label: 'Answered',
              checked: dailyStatusFilters.showAnswered,
              disabled:
                dailyStatusFilters.showAnswered &&
                !dailyStatusFilters.showRequested,
              onChange: (enabled) =>
                updateDailyStatusFilter('showAnswered', enabled),
            })}
          </div>
        )}
      </div>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && visiblePrayers.length === 0 && (
        <p className="text-gray-400">
          {isSecurity
            ? 'No prayers found.'
            : 'No prayers match the selected status filters.'}
        </p>
      )}

      {!loading && isSecurity && visiblePrayers.length > 0 && (
        <section className="mb-6">
          <ul className="space-y-3">
            {visiblePrayers.map((prayer) => {
              const requestor = requestorById.get(prayer.requestorId);

              return renderPrayerCard(
                prayer,
                requestor?.name || 'Unassigned',
                'h4'
              );
            })}
          </ul>
        </section>
      )}

      {!loading &&
        !isSecurity &&
        groupedDaily &&
        Object.keys(groupedDaily)
          .sort((categoryA, categoryB) =>
            categoryA.localeCompare(categoryB, undefined, {
              sensitivity: 'base',
            })
          )
          .map((categoryName) => (
            <section key={categoryName} className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                {categoryName}
              </h3>
              <div className="space-y-4">
                {groupedDaily[categoryName].map((group) => (
                  <div
                    key={`${categoryName}-${group.requestorId}`}
                    className="mt-2 rounded-lg border border-gray-700 p-2"
                  >
                    <h4 className="text-sm font-semibold text-gray-200 mb-2">
                      {group.requestorName}
                    </h4>
                    <ul className="space-y-3">
                      {group.items.map((prayer) =>
                        renderPrayerCard(
                          prayer,
                          group.requestorName,
                          'h5'
                        )
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-yellow-500 text-black shadow-lg hover:bg-yellow-600 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-yellow-300"
          aria-label="Add prayer"
          title="Add prayer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 5v14m-7-7h14"
            />
          </svg>
        </button>
      )}

      {editTarget && (
        <PrayerUpsertModal
          initialPrayer={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
