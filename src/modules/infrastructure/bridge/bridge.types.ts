export interface MailBucket {
  id: string;
  name: string;
}

export interface UserSpaceSnapshot {
  maxSpaceBytes: number;
  totalUsedSpaceBytes: number;
}

export interface BucketEntry extends UserSpaceSnapshot {
  id: string;
}
