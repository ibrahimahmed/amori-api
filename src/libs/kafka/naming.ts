/**
 * Kafka Naming Utility
 *
 * Helps generate and validate topic/group names using the convention:
 *   <vertical>.<action>.<module>.<key>
 *
 * Example: restaurant.created.reservation.table
 */

// --- Enums for common values ---
export const Verticals = {
  RESTAURANT: 'restaurant',
  EXPERIENCE: 'experience',
  HOTEL: 'hotel',
  FLIGHT: 'flight',
  CORE: 'core',
} as const;
export type Vertical = typeof Verticals[keyof typeof Verticals];

export const Actions = {
  // post actions
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  BOOKED: 'booked',
  CANCELLED: 'cancelled',
  // ...add more as needed
} as const;
export type Action = typeof Actions[keyof typeof Actions] | string;

// --- Modules and Keys for each vertical ---
export const RestaurantModules = {
  RESERVATION: 'reservation',
  MENU: 'menu',
  ORDER: 'order',
  TABLE: 'table',
  // ...add more as needed
} as const;
export type RestaurantModule = typeof RestaurantModules[keyof typeof RestaurantModules];

export const RestaurantKeys = {
  ITEM: 'item',
  TABLE: 'table',
  USER: 'user',
  // ...add more as needed
} as const;
export type RestaurantKey = typeof RestaurantKeys[keyof typeof RestaurantKeys];

export const HotelModules = {
  RESERVATION: 'reservation',
  BOOKING: 'booking',
  ROOM: 'room',
  // ...add more as needed
} as const;
export type HotelModule = typeof HotelModules[keyof typeof HotelModules];

export const HotelKeys = {
  ROOM: 'room',
  USER: 'user',
  // ...add more as needed
} as const;
export type HotelKey = typeof HotelKeys[keyof typeof HotelKeys];

export const FlightModules = {
  RESERVATION: 'reservation',
  SEAT: 'seat',
  // ...add more as needed
} as const;
export type FlightModule = typeof FlightModules[keyof typeof FlightModules];

export const FlightKeys = {
  SEAT: 'seat',
  USER: 'user',
  // ...add more as needed
} as const;
export type FlightKey = typeof FlightKeys[keyof typeof FlightKeys];

export const ExperienceModules = {
  REVIEW: 'review',
  BOOKING: 'booking',
  // ...add more as needed
} as const;
export type ExperienceModule = typeof ExperienceModules[keyof typeof ExperienceModules];

export const ExperienceKeys = {
  USER: 'user',
  EXPERIENCE: 'experience',
  // ...add more as needed
} as const;
export type ExperienceKey = typeof ExperienceKeys[keyof typeof ExperienceKeys];

export const CoreModules = {
  WEATHER: 'weather',
  CONTEXT: 'context',
  // ...add more as needed
} as const;
export type CoreModule = typeof CoreModules[keyof typeof CoreModules];

export const CoreKeys = {
  FORECAST: 'forecast',
  CONTEXT: 'context',
  // ...add more as needed
} as const;
export type CoreKey = typeof CoreKeys[keyof typeof CoreKeys];

export type Module = string;
export type Key = string;

/**
 * Build a topic name using the convention.
 */
export function buildTopic(vertical: Vertical, action: Action, module: Module, key: Key) {
  return `${vertical}.${action}.${module}.${key}`;
}

/**
 * Validate a topic name matches the convention.
 */
export function isValidTopicName(name: string): boolean {
  // At least 4 dot-separated segments, all lowercase, no spaces
  return /^[a-z]+(\.[a-z0-9]+){3,}$/.test(name);
}

/**
 * Build a consumer group name (recommended: <vertical>.<module>.<purpose>)
 */
export function buildGroup(vertical: Vertical, module: Module, purpose: string) {
  return `${vertical}.${module}.${purpose}`;
}

// --- Example usage ---
// const topic = buildTopic(
//   Verticals.RESTAURANT,
//   Actions.CREATED,
//   RestaurantModules.RESERVATION,
//   RestaurantKeys.TABLE
// );
// const group = buildGroup(Verticals.RESTAURANT, RestaurantModules.RESERVATION, 'notifier');
// isValidTopicName(topic); // true 