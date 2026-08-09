const FIELDS = ["name", "dose", "time", "validFrom", "validTo"];

export function compareTreatmentPlans(currentPlan = [], proposedPlan = []) {
  const current = new Map(currentPlan.map((item) => [item.id, item]));
  const proposed = new Map(proposedPlan.map((item) => [item.id, item]));
  const added = proposedPlan.filter((item) => !current.has(item.id));
  const removed = currentPlan.filter((item) => !proposed.has(item.id));
  const changed = proposedPlan.flatMap((item) => {
    const previous = current.get(item.id);
    if (!previous) return [];
    const changes = FIELDS.filter((field) => (previous[field] ?? "") !== (item[field] ?? ""))
      .map((field) => ({ field, before: previous[field] ?? "", after: item[field] ?? "" }));
    return changes.length ? [{ id: item.id, before: previous, after: item, changes }] : [];
  });
  return { added, removed, changed, total: added.length + removed.length + changed.length };
}

export const TREATMENT_FIELD_LABELS = Object.freeze({
  name: "Název", dose: "Dávka", time: "Čas", validFrom: "Platnost od", validTo: "Platnost do",
});
