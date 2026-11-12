import { useId, useRef, useState } from "react";
import { ActionIcon, Box, Button, Group, Menu, Stack, Text, TextInput } from "@mantine/core";
import type { AccountAccessProps } from "./account-access.js";
import { AccountError, AccountHeading } from "./account-feedback.js";
import { CardRow } from "./card-row.js";
import { Icon } from "./icons.js";

export function AccountCatalog({ props: p }: { props: AccountAccessProps }) {
  const [creating, setCreating] = useState(false);
  const createId = useId(); const createToggle = useRef<HTMLButtonElement>(null);
  const closeCreate = () => { setCreating(false); createToggle.current?.focus({ preventScroll: true }); };
  return <>
      <AccountHeading props={p} />
      <AccountError props={p} />
      {p.catalogState === "loading" && <Text role="status" className="lm-account-context">{p.text.loading}</Text>}
      {p.catalogState === "error" && <Button disabled={p.busy} onClick={p.onRefresh} leftSection={<Icon name="refresh" />}>{p.text.refresh}</Button>}
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
        {p.catalogState !== "loading" && p.catalogState !== "error" && p.entries.length > 0 && <Stack component="ul" className="lm-account-list" gap={0}>
          {p.entries.map(entry => <Box component="li" key={entry.id} className="lm-account-row">
            {p.mode === "trash" ? <Box className="lm-account-trash-entry"><Icon name="folder" /><Box><Text>{entry.name}</Text><Text className="lm-account-context" size="sm">{entry.detail}</Text></Box></Box> :
              <CardRow label={entry.name} detail={entry.detail} icon={<Icon name="folder" />} disabled={p.busy} onClick={() => p.onOpen(entry.id)} />}
            {p.mode === "trash" ? <Button disabled={p.busy} leftSection={<Icon name="restore" />} onClick={() => p.onRestore(entry.id)}>{p.text.restore}</Button> :
              <Menu withinPortal={false} position="bottom-end" offset={6} returnFocus>
                <Menu.Target><ActionIcon className="lm-account-icon" variant="subtle" size="lg" disabled={p.busy} aria-label={`${p.text.vaultActions}: ${entry.name}`} title={p.text.vaultActions}><Icon name="actions" /></ActionIcon></Menu.Target>
                <Menu.Dropdown className="lm-explorer-menu lm-explorer-tab-menu"><Menu.Item disabled={p.busy} leftSection={<Icon name="trash" />} onClick={() => p.onTrash(entry.id)}>{p.text.delete}</Menu.Item></Menu.Dropdown>
              </Menu>}
          </Box>)}
        </Stack>}
        {p.catalogState !== "loading" && p.catalogState !== "error" && !p.entries.length && <Box className="lm-account-empty"><Icon name={p.mode === "trash" ? "trash" : "folder"} /><Text fw={500}>{p.text[p.mode === "trash" ? "emptyTrash" : "empty"]}</Text><Text className="lm-account-context">{p.text[p.mode === "trash" ? "emptyTrashDetail" : "emptyDetail"]}</Text></Box>}
    </>;
}
