> **Note — boilerplate template:** This harness ships **markdown-first**. The
> SQLite durable layer and the Rust `harness-cli` are **optional**.

# Glossary

## Agent

An AI coding collaborator operating inside the repository.

## App Router

Next.js 13+ routing system based on the `app/` directory with React Server
Components support.

## Harness

The repo-level operating system that tells humans and agents how to turn intent
into safe product changes.

## isClient

Helper pattern (`typeof window !== "undefined"`) that guards browser-only APIs
(reload, locale persistence, i18n) from running during SSR. Auth tokens are httpOnly
cookies — inaccessible to any JavaScript, so no guard needed.

## RSC (React Server Component)

A component that renders on the server only. Cannot use hooks, effects, or
browser APIs. Next.js App Router uses RSC by default.

## Service Layer

The axios-based HTTP client (`src/services/`) including domain models, interceptors,
HMAC signing, and React Query bindings. Client-side only. Uses httpOnly cookies
(auto-sent by the browser with `withCredentials: true`); never touches token storage.

## Single-Flight Refresh

The pattern where concurrent 401 responses trigger exactly one token refresh
network call; all callers await the same in-flight promise.

## SSR Guard

A `typeof window !== "undefined"` check that makes browser-only code safe to
import in server contexts.

## Story Packet

A story-sized work file describing product contract, design notes, and
validation expectations for a feature.

## Server API Helper

Functions in `src/server/` (`serverApiGet`, `getMeServerData`, etc.) that fetch
auth-protected data in React Server Components. Forward httpOnly cookies + sign
requests with HMAC. Return null when unauthenticated or backend unreachable.

## Contract

Service layer single source of truth: endpoints (`paths`), React Query keys
(`keys`), and type definitions. Defined in `src/services/{auth,users}/contract.ts`;
aggregated in `src/services/query-keys.ts`.
