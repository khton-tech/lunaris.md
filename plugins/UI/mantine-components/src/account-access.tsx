import { Box, Button, Group, Menu, Text } from "@mantine/core";
import type { ComponentProps } from "@lunaris/components";
import type { resolveTheme } from "./theme.js";
import { AccountAuth } from "./account-auth.js";
import { AccountCatalog } from "./account-catalog.js";
import { Icon } from "./icons.js";

export interface AccountAccessProps {
  readonly mode: "connect" | "login" | "register" | "vaults" | "trash";
  readonly text: Readonly<Record<string, string>>;
  readonly address: string; readonly login: string; readonly password: string; readonly invitation: string; readonly name: string;
  readonly account: string; readonly busy: boolean; readonly error: string; readonly allowLocal: boolean;
  readonly presentation?: { readonly mode?: "standalone" | "embedded"; readonly sizing?: "fill" | "content" };
  readonly allowChangeServer?: boolean;
  readonly art?: string;
  readonly serverName?: string; readonly serverDescription?: string;
  readonly catalogState?: "loading" | "ready" | "error";
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
  if (value.catalogState !== undefined && !["loading", "ready", "error"].includes(value.catalogState as string)) throw TypeError("Invalid catalog state.");
  if (value.catalogState === "loading" && typeof (value.text as Record<string, unknown>).loading !== "string") throw TypeError("Missing loading label.");
  for (const key of ["art", "serverName", "serverDescription"]) if (value[key] !== undefined && typeof value[key] !== "string") throw TypeError("Invalid server information.");
  if (value.allowChangeServer !== undefined && typeof value.allowChangeServer !== "boolean") throw TypeError("Invalid server navigation flag.");
  return value as unknown as AccountAccessProps;
}
export function AccountAccessView({ props: p, theme }: { props: AccountAccessProps; theme: ReturnType<typeof resolveTheme> }) {
  const embedded = p.presentation?.mode === "embedded";
  const catalog = p.mode === "vaults" || p.mode === "trash";
  return <Box component="section" className="lm-account-access" data-view={catalog ? "catalog" : "auth"} data-embedded={embedded || undefined} style={theme.contentStyle} aria-busy={p.busy}>
    <Box className="lm-account-content">
      {catalog && <Group component="header" className="lm-account-topbar" justify="space-between" wrap="wrap">
        <Text className="lm-account-brand">Lunaris</Text>
        {catalog ? <Menu withinPortal={false} position="bottom-end" offset={6} returnFocus>
          <Menu.Target><Button className="lm-account-identity" disabled={p.busy} aria-label={`${p.text.accountMenu}: ${p.account}`} leftSection={<Icon name="account" />} rightSection={<Icon name="expand" />}>{p.account}</Button></Menu.Target>
          <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu" aria-label={p.text.accountMenu}>
            <Menu.Label className="lm-account-server">{p.address}</Menu.Label>
            {p.allowLocal && <Menu.Item leftSection={<Icon name="folder" />} onClick={p.onLocal}>{p.text.local}</Menu.Item>}
            {p.allowChangeServer && <Menu.Item leftSection={<Icon name="back" />} onClick={p.onChangeServer}>{p.text.changeServer}</Menu.Item>}
            <Menu.Item leftSection={<Icon name="logout" />} onClick={p.onLogout}>{p.text.logout}</Menu.Item>
          </Menu.Dropdown>
        </Menu> : p.allowLocal && <Button disabled={p.busy} onClick={p.onLocal} leftSection={<Icon name="back" />}>{p.text.local}</Button>}
      </Group>}
      {!catalog && p.mode !== "connect" && (p.serverName || p.serverDescription) && <Box className="lm-account-server-info"><Text fw={600}>{p.serverName}</Text>{p.serverDescription && <Text className="lm-account-context">{p.serverDescription}</Text>}</Box>}
      {catalog ? <AccountCatalog key={p.account} props={p} /> : <AccountAuth props={p} />}
    </Box>
  </Box>;
}
