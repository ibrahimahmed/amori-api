import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

export const corsMiddleware = new Elysia().use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://auth.etera.dev",
      // Mobile development support
      "http://localhost",
      "http://10.0.2.2:3000", // Android emulator
      "http://192.168.*", // Local network for mobile testing
      // Capacitor/Ionic support
      "capacitor://localhost",
      "ionic://localhost",
      // React Native support
      "http://localhost:8081",
      "http://localhost:19000", // Expo
      "http://localhost:19006", // Expo web
      // Custom app schemes for mobile OAuth callbacks
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, // Allow custom schemes like myapp://
    ],
    methods: ["GET", "POST", "PUT","PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);
