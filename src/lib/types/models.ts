export type SunExposure = 'full_sun' | 'part_sun' | 'shade';

export type LocationProfile = {
  zip: string;
  zone: string;
  last_frost_start: string;
  last_frost_end: string;
  first_frost_start: string;
  first_frost_end: string;
  season_length_days: number;
  source: string;
};

export type SubscriptionPlan = 'BASIC' | 'PLUS' | 'ULTRA';

export type FeatureFlags = {
  reminders: boolean;
  ultraInsights: boolean;
  emailDigest: boolean;
};
