export interface Invite {
  email: string;
  name: string;
  invitedBy: string;     // userId of sender
  invitedAt: string;     // ISO or Timestamp
  accepted: boolean;
  acceptedAt?: string;
  token: string;         // random string in invite link
}
