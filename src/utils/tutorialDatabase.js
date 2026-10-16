// Practice records never touch IndexedDB, backups, or network services.
export function createTutorialDatabase(onWrite = () => {}) {
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const sample = {
    categories: [{ id: 1, name: 'Family', description: 'People closest to us. This is practice data.', showSingle: 1 }],
    requestors: [{ id: 1, categoryId: 1, name: 'Alex', description: 'A fictional person for this walkthrough.', archived: 0 }],
    prayers: [{ id: 1, requestorId: 1, name: 'Peace before surgery', description: 'Please pray for peace and a smooth recovery for Alex.', requestedAt: yesterday, status: 'requested', security: 1 }],
    events: [{ id: 1, prayerId: 1, title: 'A word of encouragement', note: 'Alex felt encouraged after a visit from a friend.', createdAt: yesterday }],
    journalEntries: [{ id: 1, title: 'Small moments of gratitude', text: 'Today I am thankful for **kind friends**.\n\n- A thoughtful message\n- Time to pause and pray', createdAt: yesterday, updatedAt: yesterday }],
  };
  const database = { isTutorial: true };
  for (const [name, initial] of Object.entries(sample)) {
    const rows = new Map(initial.map(row => [row.id, structuredClone(row)]));
    let sequence = Math.max(0, ...rows.keys());
    const changed = operation => onWrite({ table: name, operation });
    database[name] = {
      async toArray() { return structuredClone([...rows.values()]); },
      async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : undefined; },
      async count() { return rows.size; },
      async add(row) { const id = ++sequence; rows.set(id, { ...structuredClone(row), id }); changed('add'); return id; },
      async update(id, patch) { if (!rows.has(id)) return 0; rows.set(id, { ...rows.get(id), ...structuredClone(patch) }); changed('update'); return 1; },
      async put(row) { const id = row.id ?? ++sequence; sequence = Math.max(sequence, id); rows.set(id, { ...structuredClone(row), id }); changed('put'); return id; },
      async delete(id) { rows.delete(id); changed('delete'); },
      where(field) {
        return { equals(value) {
          const matches = () => [...rows.values()].filter(row => row[field] === value);
          return {
            async toArray() { return structuredClone(matches()); },
            async count() { return matches().length; },
            async delete() { for (const row of matches()) rows.delete(row.id); changed('delete'); },
          };
        } };
      },
    };
  }
  database.transaction = async (...args) => args.at(-1)();
  return database;
}
