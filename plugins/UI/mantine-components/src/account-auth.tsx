import { Box, Button, Group, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import type { AccountAccessProps } from "./account-access.js";
import { AccountError } from "./account-feedback.js";
import { Icon } from "./icons.js";

export function AccountAuth({ props: p }: { props: AccountAccessProps }) {
  return <Box className="lm-account-auth">
        <Box component="header" className="lm-account-auth-heading">
          <Text className="lm-account-brand">Lunaris</Text>
          <Title order={1}>{p.text[p.mode]}</Title>
        </Box>
        <Box component="form" className="lm-account-auth-form" onSubmit={event => { event.preventDefault(); if (!p.busy) p.onSubmit(); }}>
        <Stack className="lm-account-auth-fields" gap="sm">
          {p.mode === "connect" ? <TextInput label={p.text.address} type="url" autoComplete="url" value={p.address} disabled={p.busy} required onChange={e => p.onField("address", e.currentTarget.value)} /> : <>
            <TextInput label={p.text.username} autoComplete="username" autoCapitalize="none" spellCheck={false} value={p.login} maxLength={64} disabled={p.busy} required onChange={e => p.onField("login", e.currentTarget.value)} />
            <PasswordInput size="md" label={p.text.password} autoComplete={p.mode === "register" ? "new-password" : "current-password"} value={p.password} minLength={p.mode === "register" ? 8 : undefined} maxLength={1024} disabled={p.busy} required
              visibilityToggleButtonProps={{ "aria-label": p.text.showPassword }} onChange={e => p.onField("password", e.currentTarget.value)} />
            {p.mode === "register" && p.invitationRequired && <TextInput label={p.text.invitation} value={p.invitation} autoComplete="off" disabled={p.busy} required onChange={e => p.onField("invitation", e.currentTarget.value)} />}
          </>}
          <AccountError props={p} />
          <Group className="lm-account-auth-actions" gap="sm">
            <Button type="submit" variant="filled" loading={p.busy} disabled={p.busy}>{p.text[p.mode]}</Button>
            {p.mode !== "connect" && <Button disabled={p.busy} onClick={p.onToggleAuth}>{p.text[p.mode === "login" ? "register" : "login"]}</Button>}
          </Group>
        </Stack>
        </Box>
        {p.mode !== "connect" && (p.allowLocal || (p.mode === "login" && p.error)) && <Box component="footer" className="lm-account-auth-footer">
          {p.mode === "login" && p.error && <Text className="lm-account-context">{p.text.passwordReset}</Text>}
          {p.allowLocal && <Button disabled={p.busy} onClick={p.onChangeServer}>{p.text.changeServer}</Button>}
        </Box>}
        {p.allowLocal && <Button className="lm-account-local" disabled={p.busy} onClick={p.onLocal} leftSection={<Icon name="back" />}>{p.text.local}</Button>}
      </Box>;
}
