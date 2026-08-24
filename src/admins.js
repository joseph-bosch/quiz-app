// admins.js — single source of truth for who counts as an admin.
// NOTE: this is a convenience gate for the UI only. It is evaluated in the
// browser, so it hides admin screens but does not secure the data behind them.
export const ADMIN_NAMES = ["olarinde joseph", "li dongqin", "demi"];

export const isAdminName = (name) =>
  ADMIN_NAMES.includes((name || "").trim().toLowerCase());
