export interface JwtTokenPayload {
  payload: {
    uuid: string;
    email: string;
    name: string;
    lastname: string;
    username: string;
    sharedWorkspace: boolean;
    networkCredentials: {
      user: string;
    };
    workspaces: { owners: string[] };
  };
  iat: number;
  exp: number;
}

export type UserPayload = JwtTokenPayload['payload'];
