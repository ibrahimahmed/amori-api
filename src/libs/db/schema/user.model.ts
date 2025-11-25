export interface User {
    id: string;
    email: string;
    password: string | null;
    phoneNumber: string | null;
    phoneNumberVerified?: boolean;
    emailVerified?: boolean;
    image?: string | null;
    name?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    firstName?: string | null;
    lastName?: string | null;
    isOnboarded?: boolean;
    onboardingComplete?: boolean;
    language?: string | null;
  }