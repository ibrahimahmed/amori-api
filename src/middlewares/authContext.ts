// Re-export auth middleware from the auth module for backwards compatibility
export { authMiddleware as authContext, optionalAuthMiddleware, type AuthUser } from "../modules/auth";
