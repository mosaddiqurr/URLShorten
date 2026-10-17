import type { Config, Context } from "@netlify/functions";
import { handleRedirect, withErrors } from "../../src/server/handlers";
import { netlifyStore } from "../../src/server/store";

export default (request: Request, context: Context) =>
  withErrors(() =>
    handleRedirect(request, netlifyStore(context.deploy.context)),
  );
export const config: Config = {
  path: ["/:alias", "/:alias/"],
  excludedPath: [
    "/preview",
    "/preview/",
    "/about",
    "/about/",
    "/index.html",
    "/robots.txt",
    "/favicon.ico",
    "/favicon.svg",
  ],
  preferStatic: true,
};
