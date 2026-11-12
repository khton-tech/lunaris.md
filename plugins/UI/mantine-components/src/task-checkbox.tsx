import { Box, Checkbox } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";

interface Props {
  readonly checked: boolean; readonly disabled: boolean; readonly label: string;
  readonly onChange: (checked: boolean) => void;
}

export function taskCheckboxProps(value: ComponentProps): Props {
  if (typeof value.checked !== "boolean" || typeof value.disabled !== "boolean" || typeof value.label !== "string"
    || !value.label.trim() || typeof value.onChange !== "function") throw new TypeError("Invalid task checkbox props.");
  return value as unknown as Props;
}

/** Embedded inline control: the editor owns line geometry and task text. */
export function TaskCheckbox({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="label" className="lm-task-checkbox-hit" data-disabled={props.disabled || undefined}>
    <Checkbox className="lm-task-checkbox" style={theme.contentStyle} size="xs"
      color="var(--vault-accent)" iconColor="var(--vault-on-accent)"
      checked={props.checked} disabled={props.disabled} aria-label={props.label}
      onChange={event => { if (!props.disabled) props.onChange(event.currentTarget.checked); }} />
  </Box>;
}
