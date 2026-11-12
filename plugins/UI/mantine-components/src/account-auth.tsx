import { Box, Button, PasswordInput, Stack, TextInput } from "@mantine/core";
import type { AccountAccessProps } from "./account-access.js";
import { AccountError, AccountHeading } from "./account-feedback.js";
import { Icon } from "./icons.js";

export function AccountAuth({ props: p }: { props: AccountAccessProps }) {
  return <Box className="lm-account-auth">
        <AccountHeading props={p} />
        <Box component="form" onSubmit={event => { event.preventDefault(); if (!p.busy) p.onSubmit(); }}>
        <Stack gap="md">
          {p.mode === "connect" ? <TextInput label={p.text.address} type="url" autoComplete="url" value={p.address} disabled={p.busy} required onChange={e => p.onField("address", e.currentTarget.value)} /> : <>
            <TextInput label={p.text.username} autoComplete="username" autoCapitalize="none" spellCheck={false} value={p.login} maxLength={64} disabled={p.busy} required onChange={e => p.onField("login", e.currentTarget.value)} />
            <PasswordInput label={p.text.password} autoComplete={p.mode === "register" ? "new-password" : "current-password"} value={p.password} minLength={p.mode === "register" ? 8 : undefined} maxLength={1024} disabled={p.busy} required
              visibilityToggleButtonProps={{ "aria-label": p.text.showPassword }} onChange={e => p.onField("password", e.currentTarget.value)} />
            {p.mode === "register" && p.invitationRequired && <TextInput label={p.text.invitation} value={p.invitation} autoComplete="off" disabled={p.busy} required onChange={e => p.onField("invitation", e.currentTarget.value)} />}
          </>}
          <AccountError props={p} />
          <Button type="submit" variant="filled" fullWidth loading={p.busy} disabled={p.busy} rightSection={<Icon name="next" />}>{p.text[p.mode]}</Button>
        </Stack>
        </Box>
        {p.mode !== "connect" && <Button className="lm-account-auth-toggle" fullWidth disabled={p.busy} onClick={p.onToggleAuth}>{p.text[p.mode === "login" ? "register" : "login"]}</Button>}
      </Box>;
}
