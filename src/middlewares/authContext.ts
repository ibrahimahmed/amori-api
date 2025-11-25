// src/middleware/authContext.ts
import { Elysia } from "elysia";
import { env } from "../config/env";

export const authContext = new Elysia()
  .derive(async ({ request, set }) => {
    try {
      const authHeader = request.headers.get('authorization');
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401;
        throw new Error("Unauthorized: Missing or invalid authorization header");
      }

      const token = authHeader.replace('Bearer ', '');

      // Use the internal verify-token endpoint for microservice integration
      const verifyRequest = new Request(`${env.AUTH_SERVICE_URL}/api/internal/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      const response = await fetch(verifyRequest);
      
      if (!response.ok) {
        set.status = 401;
        throw new Error("Unauthorized: Token verification failed");
      }

      const tokenData = await response.json();

      if (!tokenData.user) {
        set.status = 401;
        throw new Error("Unauthorized: No valid user in token");
      }

      return {
        user: tokenData.user,
        token: tokenData.token,
      };
    } catch (error) {
      set.status = 401;
      throw new Error("Unauthorized: Invalid token");
    }
  });
