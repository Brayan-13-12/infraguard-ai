"""Relationship-type taxonomy invariants (no database)."""

from __future__ import annotations

from app.models.relationship import (
    PROPAGATING_RELATIONSHIP_TYPES,
    RELATIONSHIP_TYPE_CATALOG,
    RelationshipType,
)


def test_catalog_covers_every_enum_member() -> None:
    assert set(RELATIONSHIP_TYPE_CATALOG) == {t.value for t in RelationshipType}


def test_every_entry_has_labels_and_description() -> None:
    for meta in RELATIONSHIP_TYPE_CATALOG.values():
        assert meta.label_es
        assert meta.inverse_label_es
        assert meta.description_es
        assert meta.category


def test_propagating_types_have_a_direction_non_propagating_do_not() -> None:
    for meta in RELATIONSHIP_TYPE_CATALOG.values():
        if meta.propagates_impact:
            assert meta.impact_direction in ("forward", "reverse"), meta.code
        else:
            assert meta.impact_direction is None, meta.code


def test_connects_to_and_member_of_do_not_propagate_impact() -> None:
    assert "connects_to" not in PROPAGATING_RELATIONSHIP_TYPES
    assert "member_of" not in PROPAGATING_RELATIONSHIP_TYPES


def test_depends_on_and_uses_propagate_in_reverse() -> None:
    assert RELATIONSHIP_TYPE_CATALOG["depends_on"].impact_direction == "reverse"
    assert RELATIONSHIP_TYPE_CATALOG["uses"].impact_direction == "reverse"


def test_hosts_and_provides_service_to_propagate_forward() -> None:
    assert RELATIONSHIP_TYPE_CATALOG["hosts"].impact_direction == "forward"
    assert RELATIONSHIP_TYPE_CATALOG["provides_service_to"].impact_direction == "forward"
