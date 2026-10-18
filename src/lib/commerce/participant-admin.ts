export type ParticipantAdminRow = {
  id: string;
  source: "commerce" | "legacy";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  documentLabel: string;
  maskedDocument: string;
  createdAt: string;
};

export function maskParticipantDocument(value: string) {
  const visible = Math.min(4, Math.floor(value.length / 2));
  return `${"•".repeat(Math.min(12, Math.max(4, value.length - visible)))}${visible ? value.slice(-visible) : ""}`;
}
