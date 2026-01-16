export function normalizeDoorloopTransaction(p: any) {
  return {
    // ChittyFinance transaction fields
    amount: p.amount || p.total || 0,
    date: p.date || p.createdAt,
    description: p.memo || p.type || "DoorLoop Transaction",
    category: "rent",
    source: "doorloop",
  };
}
