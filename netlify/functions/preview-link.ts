import type { Config, Context } from "@netlify/functions";
import { handlePreview, withErrors } from "../../src/server/handlers";
import { netlifyStore } from "../../src/server/store";

export default (request: Request, context: Context) =>
  withErrors(() =>
    handlePreview(request, netlifyStore(context.deploy.context)),
  );
export const config: Config = {
  path: "/api/preview",
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ["ip", "domain"] },
};
