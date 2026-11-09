import { ActionIcon, Box, Group, UnstyledButton } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { Icon } from "./icons.js";

interface Props {
  readonly title: string; readonly kind: string;
  readonly foldable: boolean; readonly collapsed: boolean;
  readonly toggleLabel: string; readonly editLabel: string;
  readonly onToggle: () => void; readonly onEdit: () => void;
}
const kinds = ["note", "abstract", "info", "todo", "tip", "success", "question", "warning", "failure", "danger", "bug", "example", "quote"];
export function calloutHeaderProps(value: ComponentProps): Props {
  if (typeof value.title !== "string" || !value.title.trim() || typeof value.kind !== "string" || !kinds.includes(value.kind)
    || typeof value.foldable !== "boolean" || typeof value.collapsed !== "boolean"
    || typeof value.toggleLabel !== "string" || !value.toggleLabel.trim() || typeof value.editLabel !== "string" || !value.editLabel.trim()
    || typeof value.onToggle !== "function" || typeof value.onEdit !== "function") throw new TypeError("Invalid callout header props.");
  return value as unknown as Props;
}
/** Owns only inline controls; document line surfaces belong to the editor contribution. */
export function CalloutHeader({ props, theme }: { props: Props; theme: ReturnType<typeof resolveTheme> }) {
  return <Box component="span" className="lm-callout-header" style={{ ...theme.contentStyle, fontSize: "inherit", fontFamily: "inherit", lineHeight: "inherit" }}>
    <Group component="span" gap={4} wrap="nowrap" align="flex-start">
      {props.foldable && <ActionIcon variant="subtle" size="xs" aria-label={props.toggleLabel} title={props.toggleLabel}
        aria-expanded={!props.collapsed} onClick={props.onToggle}>
        <span style={{ display: "inline-flex", transform: props.collapsed ? undefined : "rotate(90deg)" }}><Icon name="expand" /></span>
      </ActionIcon>}
      <UnstyledButton className="lm-callout-title" aria-label={props.editLabel + ": " + props.title} onClick={props.onEdit}>
        <Icon name={"callout-" + props.kind} /><span>{props.title}</span>
      </UnstyledButton>
    </Group>
  </Box>;
}
