import type { Config, Context } from "@netlify/functions";
import { handleCreate, withErrors } from "../../src/server/handlers";
import { netlifyStore } from "../../src/server/store";

export default (request: Request, context: Context) =>
  withErrors(() => handleCreate(request, netlifyStore(context.deploy.context)));
export const config: Config = {
  path: "/api/links",
  rateLimit: { windowSize: 60, windowLimit: 20, aggregateBy: ["ip", "domain"] },
};
