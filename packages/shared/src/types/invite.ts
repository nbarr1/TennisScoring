export interface Invite {
  token: string;
  email: string;
  name: string;
  invitedBy: string;
  invitedAt: number | string;
  accepted: boolean;
  acceptedAt?: number | string;
  acceptedBy?: string;
  divisionId?: string;
}
