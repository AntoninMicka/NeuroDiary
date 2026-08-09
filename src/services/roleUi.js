export const CAREGIVER_PANEL_ITEMS = Object.freeze([
  { id: "sekce-kartoteka", label: "Kartotéka" },
  { id: "sekce-kontakty", label: "Kontakty" },
  { id: "sekce-sdileni", label: "Sdílení dat" },
  { id: "sekce-manualy", label: "Manuály" },
]);

export function isCaregiverOnlyRoleSet(activeRoles = []) {
  const roles = new Set(activeRoles);
  return !roles.has("patient") && (roles.has("family") || roles.has("doctor"));
}

export function getDefaultPanelForRoles(activeRoles = []) {
  return isCaregiverOnlyRoleSet(activeRoles) ? "sekce-kartoteka" : "sekce-home";
}
