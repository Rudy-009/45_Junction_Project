import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { AppHeader } from "@/components/layout/AppHeader";
import { InputScreen } from "@/screens/InputScreen";
import { WorkspaceScreen } from "@/screens/WorkspaceScreen";
import { ArrowCompare } from "@/screens/ArrowCompare";
import "./styles.css";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: InputScreen,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace",
  component: WorkspaceScreen,
});

const arrowCompareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/arrow-compare",
  component: ArrowCompare,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, workspaceRoute, arrowCompareRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
