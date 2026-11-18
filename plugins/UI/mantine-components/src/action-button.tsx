import { Button } from "@mantine/core";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Button<"button">>, "variant" | "size"> & { accent?: boolean };

/** A labeled command in a form, toolbar or dialog. */
export function ActionButton({ accent, className, ...props }: Props) {
  return <Button {...props} variant="outline" size="compact-sm" data-accent={accent || undefined}
    className={className ? `lm-action-button ${className}` : "lm-action-button"} />;
}
