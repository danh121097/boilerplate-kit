/** Domain types for the Users service. */

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
}
