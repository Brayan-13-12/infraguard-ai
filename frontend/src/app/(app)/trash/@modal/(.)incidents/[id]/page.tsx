"use client";

import { useParams } from "next/navigation";

import { TrashIncidentWorkspace } from "@/components/trash/TrashDetailWorkspace";

/** Intercepting route for `/trash/incidents/<id>`. */
export default function InterceptedTrashIncident() {
  const { id } = useParams<{ id: string }>();
  return <TrashIncidentWorkspace id={id} />;
}
