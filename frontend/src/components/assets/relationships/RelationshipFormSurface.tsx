"use client";

import { useId } from "react";
import { Dialog, type DialogProps } from "@/components/ui/overlay/Dialog";

/** The same validated form can live in a contextual editor or the existing dialog. */
export function RelationshipFormSurface({ inline = false, ...props }: DialogProps & { inline?: boolean }) {
  const id = useId();
  if (!inline) return <Dialog {...props} />;
  return <section aria-labelledby={id} className="flex flex-col gap-3 p-4">
    <h2 id={id} className="text-sm font-semibold">{props.title}</h2>
    {props.children}
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">{props.footer}</div>
  </section>;
}
