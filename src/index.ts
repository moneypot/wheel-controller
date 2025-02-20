import "dotenv/config";
import {
  defaultPlugins,
  startAndListen,
  type ServerOptions,
} from "@moneypot/caas";
import { join } from "node:path";
import { MakeWheelBetPlugin } from "./plugins/make-wheel-bet.js";
import metricsRouter from "./metrics.js";

const options: ServerOptions = {
  plugins: [...defaultPlugins, MakeWheelBetPlugin],
  // Expose our public schema to @moneypot/caas
  extraPgSchemas: ["app"],
  exportSchemaSDLPath: join(
    new URL(".", import.meta.url).pathname,
    "..",
    "schema.graphql"
  ),
  userDatabaseMigrationsPath: join(
    new URL(".", import.meta.url).pathname,
    "..",
    "automigrations"
  ),
  configureApp: (app) => {
    app.use(metricsRouter);
  },
  // logger: pino.default({
  //   level: "info",
  // }),
};

startAndListen(options, ({ port }) => {
  console.log(`wheel-controller listening on ${port}`);
});
