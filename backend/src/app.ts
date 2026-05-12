import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./utils/errors";
import { assertProductionConfig, config } from "./config/env";

export function createApp(): express.Application {
  if (config.nodeEnv === "production") assertProductionConfig();

  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

  app.use("/", routes);

  app.use(errorHandler);
  return app;
}
