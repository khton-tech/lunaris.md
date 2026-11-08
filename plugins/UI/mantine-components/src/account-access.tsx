import { useId, useRef, useState } from "react";
import { ActionIcon, Box, Button, Group, Menu, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { CardRow } from "./card-row.js";
import { Icon } from "./icons.js";

export interface AccountAccessProps {
  readonly mode: "connect" | "login" | "register" | "vaults" | "trash";
  readonly text: Readonly<Record<string, string>>;
  readonly address: string; readonly login: string; readonly password: string; readonly invitation: string; readonly name: string;
  readonly account: string; readonly busy: boolean; readonly error: string; readonly allowLocal: boolean;
  readonly invitationRequired: boolean;
  readonly entries: readonly { readonly id: string; readonly name: string; readonly detail: string }[];
  readonly onField: (field: "address" | "login" | "password" | "invitation" | "name", value: string) => void;
  readonly onSubmit: () => void; readonly onToggleAuth: () => void; readonly onLocal: () => void; readonly onLogout: () => void;
  readonly onOpen: (id: string) => void; readonly onTrash: (id: string) => void; readonly onRestore: (id: string) => void;
  readonly onToggleTrash: () => void; readonly onRefresh: () => void; readonly onChangeServer: () => void;
}
export function accountAccessProps(value: ComponentProps): AccountAccessProps {
  if (!["connect", "login", "register", "vaults", "trash"].includes(value.mode as string)) throw TypeError("Invalid account access mode.");
  for (const name of ["address", "login", "password", "invitation", "name", "account", "error"]) if (typeof value[name] !== "string") throw TypeError(`Account access requires ${name}.`);
  for (const name of ["busy", "allowLocal", "invitationRequired"]) if (typeof value[name] !== "boolean") throw TypeError(`Account access requires ${name}.`);
  for (const name of ["onField", "onSubmit", "onToggleAuth", "onLocal", "onLogout", "onOpen", "onTrash", "onRestore", "onToggleTrash", "onRefresh", "onChangeServer"]) if (typeof value[name] !== "function") throw TypeError(`Account access requires ${name}.`);
  const labels = ["connect", "login", "register", "vaults", "trash", "local", "address", "username", "password", "showPassword", "invitation", "name", "create", "restore", "delete", "logout", "refresh", "empty", "changeServer", "passwordReset", "cancel", "accountMenu", "vaultActions", "loginDetail", "registerDetail", "connectDetail", "vaultsDetail", "trashDetail", "emptyTrash", "emptyDetail", "emptyTrashDetail"];
  if (!value.text || typeof value.text !== "object" || labels.some(key => typeof (value.text as Record<string, unknown>)[key] !== "string") || !Array.isArray(value.entries) || value.entries.some(entry => !entry || ["id", "name", "detail"].some(key => typeof entry[key] !== "string"))) throw TypeError("Invalid account access content.");
  return value as unknown as AccountAccessProps;
}
export function AccountAccessView({ props: p, theme }: { props: AccountAccessProps; theme: ReturnType<typeof resolveTheme> }) {
  const catalog = p.mode === "vaults" || p.mode === "trash";
  const [creating, setCreating] = useState(false);
  const createId = useId(); const createToggle = useRef<HTMLButtonElement>(null);
  const closeCreate = () => { setCreating(false); createToggle.current?.focus({ preventScroll: true }); };
  return <Box component="section" className="lm-account-access" data-view={catalog ? "catalog" : "auth"} style={theme.contentStyle} aria-busy={p.busy}>
    <Box className="lm-account-content">
      <Group component="header" className="lm-account-topbar" justify="space-between" wrap="wrap">
        <Text className="lm-account-brand">Lunaris</Text>
        {catalog ? <Menu withinPortal={false} position="bottom-end" offset={6} returnFocus transitionProps={{ transition: "fade" }}>
          <Menu.Target><Button className="lm-account-identity" disabled={p.busy} aria-label={`${p.text.accountMenu}: ${p.account}`} leftSection={<Icon name="account" />} rightSection={<Icon name="expand" />}>{p.account}</Button></Menu.Target>
          <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu" aria-label={p.text.accountMenu}>
            <Menu.Label className="lm-account-server">{p.address}</Menu.Label>
            {p.allowLocal && <Menu.Item leftSection={<Icon name="folder" />} onClick={p.onLocal}>{p.text.local}</Menu.Item>}
            <Menu.Item leftSection={<Icon name="logout" />} onClick={p.onLogout}>{p.text.logout}</Menu.Item>
          </Menu.Dropdown>
        </Menu> : p.allowLocal && <Button disabled={p.busy} onClick={p.onLocal} leftSection={<Icon name="back" />}>{p.text.local}</Button>}
      </Group>
      <Box component="header" className="lm-account-heading">
        <Title order={1}>{p.text[p.mode]}</Title>
        <Text className="lm-account-context">{p.text[`${p.mode}Detail`]}</Text>
      </Box>
      {catalog ? <>
        <Group className="lm-account-toolbar" justify="space-between" wrap="wrap" gap="xs">
          <Group gap="xs" wrap="wrap">
            <Button disabled={p.busy} onClick={() => { setCreating(false); p.onToggleTrash(); }} leftSection={<Icon name={p.mode === "trash" ? "back" : "trash"} />}>{p.text[p.mode === "trash" ? "vaults" : "trash"]}</Button>
            <ActionIcon className="lm-account-icon" variant="subtle" size="lg" disabled={p.busy} aria-label={p.text.refresh} title={p.text.refresh} onClick={p.onRefresh}><Icon name="refresh" /></ActionIcon>
          </Group>
          {p.mode === "vaults" && <Button ref={createToggle} disabled={p.busy} variant="filled" leftSection={<Icon name="create" />} aria-expanded={creating} aria-controls={createId} onClick={() => setCreating(value => !value)}>{p.text.create}</Button>}
        </Group>
        {p.mode === "vaults" && <Box className="lm-account-disclosure" data-open={creating} aria-hidden={!creating} inert={!creating}>
          <Box className="lm-account-disclosure-body"><Box component="form" className="lm-account-create" id={createId} onSubmit={event => { event.preventDefault(); if (creating && !p.busy && p.name.trim()) p.onSubmit(); }} onKeyDown={event => { if (event.key === "Escape" && !p.busy) { event.preventDefault(); closeCreate(); } }}>
            <TextInput label={p.text.name} value={p.name} maxLength={200} disabled={p.busy} required onChange={e => p.onField("name", e.currentTarget.value)} />
            <Group justify="end" gap="xs" mt="sm"><Button disabled={p.busy} onClick={closeCreate}>{p.text.cancel}</Button><Button type="submit" variant="filled" disabled={p.busy || !p.name.trim()}>{p.text.create}</Button></Group>
          </Box></Box>
        </Box>}
        {p.entries.length > 0 && <Stack component="ul" className="lm-account-list" gap={0}>
          {p.entries.map(entry => <Box component="li" key={entry.id} className="lm-account-row">
            {p.mode === "trash" ? <Box className="lm-account-trash-entry"><Icon name="folder" /><Box><Text>{entry.name}</Text><Text className="lm-account-context" size="sm">{entry.detail}</Text></Box></Box> :
              <CardRow label={entry.name} detail={entry.detail} icon={<Icon name="folder" />} disabled={p.busy} onClick={() => p.onOpen(entry.id)} />}
            {p.mode === "trash" ? <Button disabled={p.busy} leftSection={<Icon name="restore" />} onClick={() => p.onRestore(entry.id)}>{p.text.restore}</Button> :
              <Menu withinPortal={false} position="bottom-end" offset={6} returnFocus transitionProps={{ transition: "fade" }}>
                <Menu.Target><ActionIcon className="lm-account-icon" variant="subtle" size="lg" disabled={p.busy} aria-label={`${p.text.vaultActions}: ${entry.name}`} title={p.text.vaultActions}><Icon name="actions" /></ActionIcon></Menu.Target>
                <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu"><Menu.Item disabled={p.busy} leftSection={<Icon name="trash" />} onClick={() => p.onTrash(entry.id)}>{p.text.delete}</Menu.Item></Menu.Dropdown>
              </Menu>}
          </Box>)}
        </Stack>}
        {!p.entries.length && <Box className="lm-account-empty"><Icon name={p.mode === "trash" ? "trash" : "folder"} /><Text fw={500}>{p.text[p.mode === "trash" ? "emptyTrash" : "empty"]}</Text><Text className="lm-account-context">{p.text[p.mode === "trash" ? "emptyTrashDetail" : "emptyDetail"]}</Text></Box>}
      </> : <Box className="lm-account-auth">
        <Box component="form" onSubmit={event => { event.preventDefault(); if (!p.busy) p.onSubmit(); }}>
        <Stack gap="md">
          {p.mode === "connect" ? <TextInput label={p.text.address} type="url" autoComplete="url" value={p.address} disabled={p.busy} required onChange={e => p.onField("address", e.currentTarget.value)} /> : <>
            <TextInput label={p.text.username} autoComplete="username" value={p.login} maxLength={64} disabled={p.busy} required onChange={e => p.onField("login", e.currentTarget.value)} />
            <PasswordInput size="md" label={p.text.password} autoComplete={p.mode === "register" ? "new-password" : "current-password"} value={p.password} minLength={8} maxLength={1024} disabled={p.busy} required
              visibilityToggleButtonProps={{ "aria-label": p.text.showPassword }} onChange={e => p.onField("password", e.currentTarget.value)} />
            {p.mode === "register" && p.invitationRequired && <TextInput label={p.text.invitation} value={p.invitation} autoComplete="off" disabled={p.busy} required onChange={e => p.onField("invitation", e.currentTarget.value)} />}
          </>}
          <Button type="submit" variant="filled" fullWidth disabled={p.busy} rightSection={<Icon name="next" />}>{p.text[p.mode]}</Button>
        </Stack>
        </Box>
        {p.mode !== "connect" && <Button className="lm-account-auth-toggle" fullWidth disabled={p.busy} onClick={p.onToggleAuth}>{p.text[p.mode === "login" ? "register" : "login"]}</Button>}
      </Box>}
      <Text className="lm-account-error" role="alert" hidden={!p.error}>{p.error}</Text>
      {!catalog && p.mode !== "connect" && <Box component="footer" className="lm-account-footer"><Text className="lm-account-context">{p.address}</Text><Text className="lm-account-context">{p.text.passwordReset}</Text>{p.allowLocal && <Button disabled={p.busy} onClick={p.onChangeServer}>{p.text.changeServer}</Button>}</Box>}
    </Box>
  </Box>;
}
