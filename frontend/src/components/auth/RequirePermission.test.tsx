import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequirePermission } from "@/components/auth/RequirePermission";
import { LanguageProvider } from "@/i18n";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { VIEWER_USER } from "@/test/fixtures";

function renderGuard(node: React.ReactNode, user = VIEWER_USER) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>{node}</MockAuthProvider>
    </LanguageProvider>,
  );
}

describe("RequirePermission", () => {
  it("renders children when the permission is held", () => {
    renderGuard(
      <RequirePermission permission="assets.read">
        <p>inventory</p>
      </RequirePermission>,
    );
    expect(screen.getByText("inventory")).toBeInTheDocument();
  });

  it("renders the Forbidden state (not the content, not a login prompt) when missing", () => {
    renderGuard(
      <RequirePermission permission="audit.read">
        <p>secret log</p>
      </RequirePermission>,
    );
    expect(screen.queryByText("secret log")).not.toBeInTheDocument();
    expect(
      screen.getByText(/no tienes permiso para acceder a esta sección/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/iniciar sesión/i)).not.toBeInTheDocument();
  });

  it("supports anyOf", () => {
    renderGuard(
      <RequirePermission anyOf={["users.read", "roles.read"]}>
        <p>admin</p>
      </RequirePermission>,
    );
    expect(screen.queryByText("admin")).not.toBeInTheDocument();

    renderGuard(
      <RequirePermission anyOf={["users.read", "assets.read"]}>
        <p>admin2</p>
      </RequirePermission>,
      VIEWER_USER,
    );
    expect(screen.getByText("admin2")).toBeInTheDocument();
  });
});
