"""RBAC catalog + system-role definitions (no database)."""

from __future__ import annotations

from app.services import rbac


def test_permission_codes_are_stable_lowercase_dotted() -> None:
    for perm in rbac.PERMISSION_CATALOG:
        assert perm.code == perm.code.lower()
        assert "." in perm.code
        assert perm.group in rbac.PERMISSION_GROUPS
        assert perm.description


def test_permission_codes_are_unique() -> None:
    codes = [p.code for p in rbac.PERMISSION_CATALOG]
    assert len(codes) == len(set(codes))


def test_reserved_purge_permission_is_not_in_the_active_catalog() -> None:
    assert "trash.purge" in rbac.RESERVED_PERMISSION_CODES
    assert "trash.purge" not in rbac.ALL_PERMISSION_CODES


def test_administrator_holds_every_catalog_permission() -> None:
    admin = next(r for r in rbac.SYSTEM_ROLES if r.slug == "administrator")
    assert admin.permissions == rbac.ALL_PERMISSION_CODES


def test_system_role_permission_sets_are_subsets_of_the_catalog() -> None:
    for role in rbac.SYSTEM_ROLES:
        assert role.permissions <= rbac.ALL_PERMISSION_CODES, role.slug


def test_operator_can_operate_but_not_administer() -> None:
    operator = next(r for r in rbac.SYSTEM_ROLES if r.slug == "operator").permissions
    assert {
        "assets.create",
        "incidents.resolve",
        "trash.restore",
        "ai.use",
        "relationships.manage",
    } <= operator
    assert operator.isdisjoint(
        {"users.manage", "roles.manage", "assets.delete", "incidents.delete"}
    )


def test_analyst_is_read_only_plus_audit() -> None:
    analyst = next(r for r in rbac.SYSTEM_ROLES if r.slug == "analyst")
    assert analyst.permissions == {
        "assets.read",
        "incidents.read",
        "audit.read",
        "trash.read",
        "ai.use",
        "relationships.read",
    }


def test_viewer_is_read_only_no_audit_no_trash() -> None:
    viewer = next(r for r in rbac.SYSTEM_ROLES if r.slug == "viewer")
    assert viewer.permissions == {
        "assets.read",
        "incidents.read",
        "ai.use",
        "relationships.read",
    }
    assert viewer.permissions.isdisjoint({"audit.read", "trash.read", "relationships.manage"})


def test_every_system_role_can_use_ai() -> None:
    for role in rbac.SYSTEM_ROLES:
        assert "ai.use" in role.permissions, role.slug


def test_every_system_role_can_read_relationships() -> None:
    for role in rbac.SYSTEM_ROLES:
        assert "relationships.read" in role.permissions, role.slug


def test_default_role_is_viewer() -> None:
    assert rbac.DEFAULT_ROLE_SLUG == "viewer"
    assert rbac.DEFAULT_ROLE_SLUG in {r.slug for r in rbac.SYSTEM_ROLES}


def test_validated_codes_rejects_unknown() -> None:
    import pytest

    assert rbac._validated_codes(["assets.read", "assets.read"]) == {"assets.read"}
    with pytest.raises(ValueError, match="unknown permission"):
        rbac._validated_codes(["assets.read", "nope.invent"])
