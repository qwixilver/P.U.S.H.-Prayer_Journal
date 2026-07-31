// src/components/PrayerList.jsx
// Daily/Security list with grouped Daily view, flat Security view,
// prayer events, explicit detail controls, add/edit controls, and PWA actions.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import PrayerForm from './PrayerForm';
import PrayerUpsertModal from './PrayerUpsertModal';
import PrayerEventList from './PrayerEventList';
import PrayerEventForm from './PrayerEventForm';

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

  const groupedDaily = useMemo(() => {
    if (isSecurity) return null;

    const byCategory = new Map();

    for (const prayer of prayers) {
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
  }, [isSecurity, prayers, requestorById, categoryById]);

  const handleAddSuccess = async () => {
    await load();
    setShowAddForm(false);
  };

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

      <h2 className="text-2xl font-bold mb-4">
        {isSecurity ? 'Security' : 'Daily'} Prayers
      </h2>

      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && prayers.length === 0 && (
        <p className="text-gray-400">No prayers found.</p>
      )}

      {!loading && isSecurity && prayers.length > 0 && (
        <section className="mb-6">
          <ul className="space-y-3">
            {prayers.map((prayer) => {
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
            categoryB.localeCompare(categoryA, undefined, {
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
