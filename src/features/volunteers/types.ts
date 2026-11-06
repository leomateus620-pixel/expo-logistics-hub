export interface TeamContact {
  person_id: string;
  membership_id: string;
  email: string | null;
  version: number;
  membership_version: number;
  can_edit_identity: boolean;
  access_state: string | null;
}
export interface SavedVolunteer {
  person_id: string;
  membership_id: string;
  version: number;
}
export interface VolunteerInput {
  name: string;
  email: string;
  personId?: string;
  expectedVersion?: number;
  requestId: string;
}
export interface AvatarCrop {
  x: number;
  y: number;
  size: number;
}
export interface VolunteerPhoto {
  file: File;
  crop: AvatarCrop;
  preview: string;
}
