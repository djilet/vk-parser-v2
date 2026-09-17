export type AccountSummary = {
  userId: number | undefined;
  email: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  browserId: number;
  expired: boolean;
  needsSession: boolean;
};

export type SetupJobStatus = 'idle' | 'running' | 'succeeded' | 'failed';

export type SetupJobState = {
  status: SetupJobStatus;
  error?: string;
};

export type AccountSetupStatus = {
  session: SetupJobState;
  token: SetupJobState;
};
