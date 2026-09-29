import { renderWithI18n } from "@/__tests__/helpers/render-with-i18n";
import { UsersListClient } from "@/app/users/users-list-client";
import { makeQueryClient } from "@/services/core/query-client";
import { queryKeys } from "@/services/query-keys";
import { QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import NotFoundPage from "@/app/not-found";

/** Server-render the users list with `data` seeded in the query cache (no fetch). */
async function renderUsers(data: unknown) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData([queryKeys.users.list], data);
  return renderWithI18n(
    createElement(QueryClientProvider, { client: queryClient }, createElement(UsersListClient)),
  );
}

describe("not-found page", () => {
  it("renders the localized title, description and a link home", async () => {
    const html = await renderWithI18n(createElement(NotFoundPage));
    expect(html).toContain("Page not found");
    expect(html).toContain("The page you are looking for does not exist.");
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to home");
  });

  it("follows the active language", async () => {
    const html = await renderWithI18n(createElement(NotFoundPage), "ja");
    expect(html).toContain("ページが見つかりません");
  });
});

describe("users list page", () => {
  const meta = { page: 1, limit: 20, total: 0, totalPages: 0 };

  it("reads the paginated envelope and lists the users", async () => {
    const html = await renderUsers({
      status: "success",
      data: [{ _id: "1", name: "Ada", email: "ada@example.com" }],
      meta: { ...meta, total: 1, totalPages: 1 },
    });
    expect(html).toContain("Ada");
    expect(html).toContain("ada@example.com");
    expect(html).not.toContain("No users yet.");
  });

  it("shows the empty state when the list is empty", async () => {
    const html = await renderUsers({ status: "success", data: [], meta });
    expect(html).toContain("No users yet.");
  });
});
