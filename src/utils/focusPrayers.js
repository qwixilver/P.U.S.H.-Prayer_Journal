export function focusPrayers(categories, requestors, prayers) {
  const categoryById = new Map(categories.filter(category => Boolean(category.showSingle)).map(category => [category.id, category]));
  const requestorById = new Map(requestors.filter(requestor => !requestor.archived && categoryById.has(requestor.categoryId)).map(requestor => [requestor.id, requestor]));
  return prayers.flatMap(prayer => {
    const requestor = requestorById.get(prayer.requestorId);
    const status = String(prayer.status ?? '').trim().toLowerCase();
    const active = status === 'requested' || (status !== 'answered' && !prayer.answeredAt);
    if (!requestor || !active) return [];
    return [{ ...prayer, requestorName: requestor.name || 'Unassigned',
      categoryName: categoryById.get(requestor.categoryId).name || 'Unassigned' }];
  });
}
