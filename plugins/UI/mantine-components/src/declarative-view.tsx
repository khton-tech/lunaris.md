import { Box, Button, Checkbox, Group, Stack, Text, TextInput, Textarea } from "@mantine/core";
import type { CSSProperties } from "react";
import type { ComponentProps, ViewColor, ViewNode, ViewShape } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { SettingsSelect } from "./settings-select.js";

export function declarativeViewProps(props: ComponentProps): { readonly tree: ViewNode } {
  let nodes = 0; let shapes = 0; let characters = 0;
  const text = (value: unknown, max = 4096): value is string => { if (typeof value !== 'string' || value.length > max) return false; characters += value.length; return characters <= 1024 * 1024; };
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000;
  const color = (value: unknown): value is ViewColor => ['text', 'muted', 'accent', 'error', 'surface', 'none'].includes(value as string);
  const shape = (item: ViewShape): boolean => {
    if (++shapes > 2048 || !item || !color(item.color)) return false;
    switch (item.kind) {
      case 'path': return text(item.d, 32768) && (item.fill === undefined || color(item.fill));
      case 'circle': return number(item.x) && number(item.y) && number(item.radius) && item.radius >= 0 && (item.fill === undefined || color(item.fill));
      case 'line': return number(item.x) && number(item.y) && number(item.x2) && number(item.y2);
      case 'text': return number(item.x) && number(item.y) && text(item.text);
      default: return false;
    }
  };
  const node = (item: ViewNode, depth: number): boolean => {
    if (++nodes > 2048 || depth > 32 || !item || typeof item !== 'object') return false;
    switch (item.kind) {
      case 'text': return text(item.text);
      case 'row': case 'column': case 'grid': return Array.isArray(item.children) && (item.columns === undefined || Number.isInteger(item.columns) && item.columns >= 1 && item.columns <= 12) && item.children.every(child => node(child, depth + 1));
      case 'drawing': return text(item.label, 512) && !!item.label.trim() && number(item.width) && number(item.height) && item.width > 0 && item.height > 0 && item.width <= 4096 && item.height <= 4096 && Array.isArray(item.shapes) && item.shapes.every(shape) && (item.onPointer === undefined || typeof item.onPointer === 'function') && (item.onKey === undefined || typeof item.onKey === 'function');
      default: {
        if (!text(item.label, 512) || !item.label.trim() || (item.disabled !== undefined && typeof item.disabled !== 'boolean')) return false;
        if (item.kind === 'button') return typeof item.onPress === 'function';
        if (item.kind === 'checkbox') return typeof item.checked === 'boolean' && typeof item.onChange === 'function';
        if (item.kind === 'input' || item.kind === 'textarea') return text(item.value) && typeof item.onChange === 'function';
        if (item.kind === 'select') return text(item.value) && typeof item.onChange === 'function' && Array.isArray(item.options) && item.options.length <= 256 && item.options.every(option => text(option?.value, 512) && text(option?.label, 512)) && new Set(item.options.map(option => option.value)).size === item.options.length;
        return false;
      }
    }
  };
  if (!node(props.tree as ViewNode, 0)) throw new TypeError('Invalid declarative view tree.');
  return { tree: props.tree as ViewNode };
}
const color = (value: ViewColor = 'none') => ({ text: 'var(--vault-text)', muted: 'var(--vault-secondary)', accent: 'var(--vault-accent)', error: 'var(--vault-error)', surface: 'var(--vault-panel)', none: 'none' })[value];
function Shape({ shape }: { shape: ViewShape }) {
  switch (shape.kind) {
    case 'path': return <path d={shape.d} stroke={color(shape.color)} fill={color(shape.fill)} />;
    case 'circle': return <circle cx={shape.x} cy={shape.y} r={shape.radius} stroke={color(shape.color)} fill={color(shape.fill)} />;
    case 'line': return <line x1={shape.x} y1={shape.y} x2={shape.x2} y2={shape.y2} stroke={color(shape.color)} />;
    case 'text': return <text x={shape.x} y={shape.y} fill={color(shape.color)}>{shape.text}</text>;
  }
}
function Node({ node }: { node: ViewNode }) {
  switch (node.kind) {
    case 'text': return <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{node.text}</Text>;
    case 'row': return <Group gap="sm" wrap="wrap" style={{ minWidth: 0 }}>{node.children.map((child, index) => <Node key={index} node={child} />)}</Group>;
    case 'column': return <Stack gap="sm" style={{ minWidth: 0 }}>{node.children.map((child, index) => <Node key={index} node={child} />)}</Stack>;
    case 'grid': return <Box className="lm-declarative-grid" style={{ '--view-columns': node.columns ?? 1 } as CSSProperties}>{node.children.map((child, index) => <Node key={index} node={child} />)}</Box>;
    case 'button': return <Button variant="subtle" size="compact-sm" disabled={!!node.disabled} onClick={() => node.onPress()}>{node.label}</Button>;
    case 'input': return <TextInput size="sm" label={node.label} value={node.value} disabled={!!node.disabled} classNames={{ input: 'lm-input lm-setting-input' }} onChange={event => node.onChange(event.currentTarget.value)} />;
    case 'textarea': return <Textarea size="sm" label={node.label} value={node.value} disabled={!!node.disabled} autosize minRows={3} maxRows={16} classNames={{ input: 'lm-input lm-setting-input' }} onChange={event => node.onChange(event.currentTarget.value)} />;
    case 'select': return <SettingsSelect label={node.label} aria-label={node.label} value={node.value} options={node.options} disabled={!!node.disabled} onChange={node.onChange} />;
    case 'checkbox': return <Checkbox className="lm-task-checkbox" label={node.label} checked={node.checked} disabled={!!node.disabled} onChange={event => node.onChange(event.currentTarget.checked)} />;
    case 'drawing': return <svg className="lm-declarative-drawing" viewBox={`0 0 ${node.width} ${node.height}`} width={node.width} height={node.height} role={node.onPointer || node.onKey ? 'application' : 'img'} aria-label={node.label} tabIndex={node.onPointer || node.onKey ? 0 : undefined}
      style={{ width: '100%', height: 'auto', minWidth: 0 }}
      onPointerDown={event => {
        if (!node.onPointer) return; const bounds = event.currentTarget.getBoundingClientRect();
        node.onPointer({ x: bounds.width ? (event.clientX - bounds.left) * node.width / bounds.width : 0, y: bounds.height ? (event.clientY - bounds.top) * node.height / bounds.height : 0, button: event.button, shift: event.shiftKey });
      }}
      onKeyDown={event => {
        if (!node.onKey) return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) event.preventDefault();
        node.onKey({ key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey });
      }}>
      {node.shapes.map((shape, index) => <Shape key={index} shape={shape} />)}
    </svg>;
  }
}
export function DeclarativeView({ props, theme }: { props: { readonly tree: ViewNode }; theme: ReturnType<typeof resolveTheme> }) {
  return <Box className="lm-declarative-view" style={{ ...theme.contentStyle, minWidth: 0, width: '100%' }}><Node node={props.tree} /></Box>;
}
