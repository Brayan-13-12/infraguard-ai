"use client";

import { useParams } from "next/navigation";

import { IncidentEditDrawer } from "@/components/incidents/IncidentEditDrawer";

/** Intercepts `/incidents/[id]/edit` - replaces the detail drawer in the modal slot. */
export default function InterceptedIncidentEdit() {
  const { id } = useParams<{ id: string }>();
  return <IncidentEditDrawer id={id} />;
}
