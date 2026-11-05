export type ParticipantRosterActivity = {
  id: string;
  name: string;
  kind: string;
  status: string;
  checkedInAt: string | null;
  menuChoice: string | null;
};

export type ParticipantRosterRow = {
  id: string;
  source: "commerce" | "legacy";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  buyerEmail: string;
  documentType: string;
  documentCountry: string;
  /** Present only in an explicitly requested staff download or participant detail. */
  documentNumber: string;
  maskedDocument: string;
  packageName: string;
  status: "paid" | "used" | "pending" | "refunded" | "canceled";
  valid: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
  createdAt: string | null;
  affiliateId: string | null;
  affiliateName: string;
  activities: ParticipantRosterActivity[];
  privacyVersion: string;
  contactCreatedAt: string | null;
  contactAvailable: boolean;
  /** Choice submitted with the matching contact registration, not newsletter status. */
  marketingConsent: boolean | null;
};

export type ParticipantRoster = {
  event: { id: string; title: string; startsAt: string; canceled: boolean };
  affiliate: { id: string; name: string } | null;
  participants: ParticipantRosterRow[];
};

export type ParticipantRosterInput = {
  locale: string;
  eventId: string;
  affiliateId?: string;
  includeDocuments?: boolean;
  /** Internal single-person scope used by the protected details endpoint. */
  participantId?: string;
  source?: string;
};

export type ParticipantDetails = {
  event: ParticipantRoster["event"];
  participant: ParticipantRosterRow;
};

export type ParticipantDetailsInput = {
  locale: string;
  eventId: string;
  participantId: string;
  source: string;
};
