export interface Tier {
  id: string;
  label: string;
  productId: string;
  billingType: string;
  featuresPerService: {
    drive?: {
      enabled: boolean;
      maxSpaceBytes: number;
    };
    mail?: {
      enabled: boolean;
      addressesPerUser: number;
    };
    [key: string]: unknown;
  };
}
