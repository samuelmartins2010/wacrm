"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { DndContextProps } from "@dnd-kit/core";

/**
 * dnd-kit announces drag instructions/progress to screen readers in
 * English by default ("To pick up a draggable item…"). These are the
 * translated versions for the pipeline board and stage list.
 */
export function useDndA11y(): DndContextProps["accessibility"] {
  const t = useTranslations("Pipelines.dnd");
  return useMemo(
    () => ({
      screenReaderInstructions: { draggable: t("instructions") },
      announcements: {
        onDragStart: () => t("dragStart"),
        onDragOver: ({ over }) => (over ? t("dragOver") : t("dragOverNone")),
        onDragEnd: () => t("dragEnd"),
        onDragCancel: () => t("dragCancel"),
      },
    }),
    [t],
  );
}
