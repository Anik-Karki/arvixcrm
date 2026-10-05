export type Role =
  | "admin"
  | "team_leader"
  | "affiliate_manager"
  | "finance"
  | "security";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: Role;
  teamId: string | null;
  initials: string;
}
