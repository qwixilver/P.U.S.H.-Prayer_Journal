// src/components/PrayerForm.jsx

import React, { useEffect, useState } from 'react';
import { db } from '../db';

/**
 * A form to add a new prayer request.
 * First select a Category, then the Requestor dropdown
 * is populated with only those requestors in that category.
 *
 * @param {{ onSuccess: () => void }} props
 */
export default function PrayerForm({ onSuccess }) {
  // Loaded categories for the first dropdown
  const [categories, setCategories] = useState([]);
  // Loaded requestors for the selected category
  const [requestors, setRequestors] = useState([]);

  // Form field state
  const [categoryId, setCategoryId] = useState('');
  const [requestorId, setRequestorId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requestedAt, setRequestedAt] = useState(new Date().toISOString().slice(0,10)); // yyyy-mm-dd
  const [status, setStatus] = useState('requested');
  const [security, setSecurity] = useState(false);

  // Load all categories on mount
  useEffect(() => {
    db.categories.toArray().then(setCategories).catch(console.error);
  }, []);

  // Whenever categoryId changes, reload requestors just for that category
  useEffect(() => {
    if (!categoryId) {
      setRequestors([]);
      setRequestorId('');
      return;
    }
    db.requestors
      .where('categoryId')
      .equals(parseInt(categoryId, 10))
      .toArray()
      .then(reqs => {
        setRequestors(reqs);
        // Reset any previous requestor selection
        setRequestorId('');
      })
      .catch(console.error);
  }, [categoryId]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!categoryId) {
      alert('Please select a category first.');
      return;
    }
    if (!requestorId) {
      alert('Please select a requestor.');
      return;
    }
    if (!name.trim()) {
      alert('Please enter a prayer name.');
      return;
    }

    // Insert into IndexedDB
    try {
      await db.prayers.add({
        requestorId: parseInt(requestorId, 10),
        name: name.trim(),
        description: description.trim(),
        requestedAt: new Date(requestedAt).toISOString(),
        answeredAt: null,
        status,
        security: security ? 1 : 0
      });
      // Clear the form
      setName('');
      setDescription('');
      setSecurity(false);
      setStatus('requested');
      // Notify parent to reload
      onSuccess();
    } catch (err) {
      console.error('Error adding prayer:', err);
      alert('Failed to add prayer. Check console for details.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-800 rounded-lg">
      {/* Category selector */}
      <div>
        <label className="block text-gray-300">Category</label>
        <select
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
        >
          <option value="">— Select Category —</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Requestor selector, only once a category is picked */}
      <div>
        <label className="block text-gray-300">Requestor</label>
        <select
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={requestorId}
          onChange={e => setRequestorId(e.target.value)}
          disabled={!categoryId}
        >
          <option value="">— {categoryId ? 'Select Requestor' : 'Pick a Category first'} —</option>
          {requestors.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Prayer name */}
      <div>
        <label className="block text-gray-300">Prayer Title</label>
        <input
          type="text"
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Short descriptive title"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-gray-300">Description</label>
        <textarea
          className="w-full mt-1 p-2 bg-gray-700 rounded text-white"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Longer explanation (optional)"
        />
      </div>

      {/* Date & status */}
      <div className="flex space-x-4">
        <div>
          <label className="block text-gray-300">Requested Date</label>
          <input
            type="date"
            className="mt-1 p-2 bg-gray-700 rounded text-white"
            value={requestedAt}
            onChange={e => setRequestedAt(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-gray-300">Status</label>
          <select
            className="mt-1 p-2 bg-gray-700 rounded text-white"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="requested">Requested</option>
            <option value="answered">Answered</option>
          </select>
        </div>
      </div>

      {/* Security checkbox */}
      <label className="inline-flex items-center text-gray-300">
        <input
          type="checkbox"
          className="form-checkbox h-5 w-5 text-yellow-400"
          checked={security}
          onChange={e => setSecurity(e.target.checked)}
        />
        <span className="ml-2">Security View Only</span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        className="w-full py-2 bg-yellow-500 rounded text-black font-semibold hover:bg-yellow-600"
      >
        Add Prayer
      </button>
    </form>
  );
}
