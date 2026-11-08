import { Box, Button, Group, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
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
  const labels = ["connect", "login", "register", "vaults", "trash", "local", "address", "username", "password", "showPassword", "invitation", "name", "create", "restore", "delete", "logout", "refresh", "empty", "changeServer", "passwordReset"];
  if (!value.text || typeof value.text !== "object" || labels.some(key => typeof (value.text as Record<string, unknown>)[key] !== "string") || !Array.isArray(value.entries) || value.entries.some(entry => !entry || ["id", "name", "detail"].some(key => typeof entry[key] !== "string"))) throw TypeError("Invalid account access content.");
  return value as unknown as AccountAccessProps;
}
export function AccountAccessView({ props: p, theme }: { props: AccountAccessProps; theme: ReturnType<typeof resolveTheme> }) {
  const catalog = p.mode === "vaults" || p.mode === "trash";
  return <Box component="section" className="lm-account-access" style={theme.contentStyle} aria-busy={p.busy}>
    <Box className="lm-account-content">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>{p.text[catalog ? p.mode === "trash" ? "trash" : "vaults" : p.mode]}</Title>
        {p.allowLocal && <Button disabled={p.busy} onClick={p.onLocal}>{p.text.local}</Button>}
      </Group>
      {catalog ? <>
        <Text className="lm-account-context">{p.account} · {p.address}</Text>
        <Group gap="xs" wrap="wrap">
          <Button disabled={p.busy} onClick={p.onToggleTrash}>{p.text[p.mode === "trash" ? "vaults" : "trash"]}</Button>
          <Button disabled={p.busy} onClick={p.onRefresh}>{p.text.refresh}</Button>
          <Button disabled={p.busy} onClick={p.onLogout}>{p.text.logout}</Button>
        </Group>
        <Stack component="ul" className="lm-account-list" gap="xs">
          {p.entries.map(entry => <Box component="li" key={entry.id} className="lm-account-row">
            <CardRow label={entry.name} detail={entry.detail} icon={<Icon name="folder" />} disabled={p.busy} onClick={() => p.mode === "trash" ? p.onRestore(entry.id) : p.onOpen(entry.id)} />
            <Button disabled={p.busy} onClick={() => p.mode === "trash" ? p.onRestore(entry.id) : p.onTrash(entry.id)}>{p.text[p.mode === "trash" ? "restore" : "delete"]}</Button>
          </Box>)}
        </Stack>
        {!p.entries.length && <Text>{p.text.empty}</Text>}
        {p.mode === "vaults" && <Box component="form" onSubmit={event => { event.preventDefault(); p.onSubmit(); }}>
          <Group align="end" wrap="wrap"><TextInput label={p.text.name} value={p.name} maxLength={200} disabled={p.busy} required onChange={e => p.onField("name", e.currentTarget.value)} />
            <Button type="submit" variant="filled" disabled={p.busy || !p.name.trim()}>{p.text.create}</Button></Group>
        </Box>}
      </> : <Box component="form" onSubmit={event => { event.preventDefault(); p.onSubmit(); }}>
        <Stack gap="sm">
          {p.mode === "connect" ? <TextInput label={p.text.address} type="url" autoComplete="url" value={p.address} disabled={p.busy} required onChange={e => p.onField("address", e.currentTarget.value)} /> : <>
            <Text className="lm-account-context">{p.address}</Text>
            <TextInput label={p.text.username} autoComplete="username" value={p.login} maxLength={64} disabled={p.busy} required onChange={e => p.onField("login", e.currentTarget.value)} />
            <PasswordInput size="md" label={p.text.password} autoComplete={p.mode === "register" ? "new-password" : "current-password"} value={p.password} minLength={8} maxLength={1024} disabled={p.busy} required
              visibilityToggleButtonProps={{ "aria-label": p.text.showPassword }} onChange={e => p.onField("password", e.currentTarget.value)} />
            {p.mode === "register" && p.invitationRequired && <TextInput label={p.text.invitation} value={p.invitation} autoComplete="off" disabled={p.busy} required onChange={e => p.onField("invitation", e.currentTarget.value)} />}
          </>}
          <Button type="submit" variant="filled" disabled={p.busy}>{p.text[p.mode]}</Button>
          {p.mode !== "connect" && <Group justify="space-between" wrap="wrap">
            <Button disabled={p.busy} onClick={p.onToggleAuth}>{p.text[p.mode === "login" ? "register" : "login"]}</Button>
            <Button disabled={p.busy} onClick={p.onChangeServer}>{p.text.changeServer}</Button>
          </Group>}
        </Stack>
      </Box>}
      <Text role="alert" hidden={!p.error}>{p.error}</Text>
      {!catalog && p.mode !== "connect" && <Text className="lm-account-context">{p.text.passwordReset}</Text>}
    </Box>
  </Box>;
}
