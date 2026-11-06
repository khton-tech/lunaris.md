import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button, type ButtonProps } from "@mantine/core";
import { Icon } from "./icons.js";

type CardRowProps = Pick<ButtonProps, "disabled"> &
  Pick<ComponentPropsWithRef<"button">, "onClick" | "className" | "title" | "ref" | "aria-expanded" | "aria-controls" | "aria-current"> & {
  label: string;
  detail?: string;
  icon: ReactNode;
};

/** Shared single-line card for navigation and disclosure actions. */
export function CardRow({ label, detail, icon, className, title, ...props }: CardRowProps) {
  return <Button {...props} type="button" className={`lm-card-row ${className ?? ""}`}
    title={title ?? (detail ? `${label} — ${detail}` : label)}
    leftSection={icon} rightSection={<Icon name="expand" />}>
    <span className="lm-card-content" data-with-detail={!!detail || undefined}>
      <span className="lm-card-name">{label}</span>
      {detail && <span className="lm-card-detail">{detail}</span>}
    </span>
  </Button>;
}
