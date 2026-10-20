export type MobileLabResult = {
  width: number;
  path: string;
  status: number | undefined;
  horizontalOverflow: boolean;
  errors: string[];
  samples: Array<{ kind: string; name: string; value: number; phase?: string }>;
  csp: Array<{ directive: string; disposition: string }>;
  navigation: Array<{ ttfb: number; load: number }>;
};
export function profileMobile(base: string, cookieHeader?: string, conversationId?: string, quick?: boolean): Promise<MobileLabResult[]>;
