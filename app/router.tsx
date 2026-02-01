import { Suspense, lazy } from "react"
import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { ThemeBackground } from "./components/ThemeController"
import { ErrorCard } from "./components/ErrorCard"

// Lazy Components
const LobbyView = lazy(() => import("./components/LobbyView"))
const GameCanvas = lazy(() => import("./components/GameCanvas"))
const NotFound = lazy(() => import("./components/NotFound"))

// 1. Create a Root Route
// This renders the main layout shared by all pages (Theme, Background)
const rootRoute = createRootRoute({
  component: () => (
    <>
      <ThemeBackground />
      <div className="relative min-h-screen">
        <Outlet />
      </div>
    </>
  ),
  notFoundComponent: () => (
    <Suspense fallback={null}>
      <NotFound />
    </Suspense>
  ),
  errorComponent: () => (
    <ErrorCard
      message="We are having some issues, please try again later."
      title="Something went wrong"
    />
  ),
})

// 2. Create the Index Route (Lobby)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => ({
    error: search.error as string | undefined,
  }),
  component: () => (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <LobbyView />
    </Suspense>
  ),
})

// 3. Create the Game Route (Room)
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$room",
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode as string | undefined,
    password: search.password as string | undefined,
  }),
  loader: async ({ params }) => {
    // Only fetch if looks like a valid room to save bandwidth on bots
    if (!/^[a-z]{4}$/.test(params.room)) return null

    try {
      const res = await fetch(`/parties/main/${params.room}`)
      if (res.status === 403) {
        throw redirect({
          to: "/",
          search: { error: "banned" },
        })
      }
      if (!res.ok) return null
      return (await res.json()) as { isPrivate: boolean; mode?: string }
    } catch (e) {
      if (e instanceof Response) throw e // Rethrow redirects
      return null // Fail gracefully for network errors
    }
  },
  component: () => {
    const { room } = gameRoute.useParams()
    const roomInfo = gameRoute.useLoaderData()

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        }
      >
        <GameCanvas room={room} initialRoomInfo={roomInfo} />
      </Suspense>
    )
  },
})

// 4. Create the Route Tree
const routeTree = rootRoute.addChildren([indexRoute, gameRoute])

// 5. Create the Router
export const router = createRouter({
  routeTree,
})

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
