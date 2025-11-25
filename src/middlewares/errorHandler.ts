import { Elysia } from "elysia";
import { logger } from "../libs/logger";

export const errorHandler = new Elysia().onError(({ error, code, set }) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error("Request error", error instanceof Error ? error : new Error(String(error)));

  let status: number;
  switch (code) {
    case "VALIDATION":
      status = 400;
      set.status = status;
      return {
        error: "Validation Error",
        message: "Invalid request data",
        details: errorMessage,
      };
    case "NOT_FOUND":
      status = 404;
      set.status = status;
      return {
        error: "Not Found",
        message: "The requested resource was not found",
      };
    case "PARSE":
      status = 400;
      set.status = status;
      return {
        error: "Parse Error",
        message: "Invalid JSON in request body",
      };
    case "INTERNAL_SERVER_ERROR":
      status = 500;
      set.status = status;
      return {
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      };
    default:
      status = 500;
      set.status = status;
      const response = {
        error: "Unknown Error",
        message: "An unexpected error occurred",
        ...(process.env.NODE_ENV === "development" && {
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }),
      };
      // Guard: ensure status is always valid
      if (!set.status || set.status < 200 || set.status > 599) {
        set.status = 422;
      }
      return response;
  }
});
