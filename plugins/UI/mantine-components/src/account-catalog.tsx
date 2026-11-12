import { useId, useRef, useState } from "react";
import { ActionIcon, Box, Button, Group, Loader, Menu, Stack, Text, TextInput } from "@mantine/core";
import type { AccountAccessProps } from "./account-access.js";
import { AccountError } from "./account-feedback.js";
import { CardRow } from "./card-row.js";
import { Icon } from "./icons.js";

export function AccountCatalog({ props: p }: { props: AccountAccessProps }) {
  const [creating, setCreating] = useState(false);
  const createId = useId(); const createToggle = useRef<HTMLButtonElement>(null);
  const closeCreate = () => { setCreating(false); createToggle.current?.focus({ preventScroll: true }); };
  return <Box className="lm-account-catalog">
    <Box component="section" className="lm-account-vaults" aria-label={p.text[p.mode]}>
      <Group className="lm-account-list-heading" justify="space-between" wrap="nowrap">
        <Text component="h1" fw={500}>{p.text[p.mode]}</Text>
        <ActionIcon className="lm-account-icon" variant="subtle" disabled={p.busy} aria-label={p.text.refresh} title={p.text.refresh} onClick={p.onRefresh}><Icon name="refresh" /></ActionIcon>
      </Group>
      {p.catalogState === "loading" && <Group role="status" gap="sm"><Loader type="oval" size={16} color="var(--vault-secondary)" aria-hidden="true" /><Text className="lm-account-context">{p.text.loading}</Text></Group>}
      {p.catalogState === "error" && <Button disabled={p.busy} onClick={p.onRefresh}>{p.text.refresh}</Button>}
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

    </Box>
    <Box className="lm-account-main">
      <Box className="lm-account-main-content">
        {p.art ? <Box component="pre" className="lm-account-art" aria-label="Lunaris">{p.art}</Box> : <Text className="lm-account-wordmark">Lunaris</Text>}
        {p.serverName && <Text className="lm-account-catalog-server">{p.serverName}</Text>}
        <AccountError props={p} />
        <Stack className="lm-account-toolbar" gap="xs">
          {p.mode === "vaults" && <CardRow ref={createToggle} label={p.text.create!} icon={<Icon name="create" />} disabled={p.busy} aria-expanded={creating} aria-controls={createId} onClick={() => setCreating(value => !value)} />}
          <CardRow label={p.text[p.mode === "trash" ? "vaults" : "trash"]!} disabled={p.busy} icon={<Icon name={p.mode === "trash" ? "back" : "trash"} />} onClick={() => { setCreating(false); p.onToggleTrash(); }} />
        </Stack>
        {p.mode === "vaults" && <Box className="lm-account-disclosure" data-open={creating} aria-hidden={!creating} inert={!creating}>
          <Box className="lm-account-disclosure-body"><Box component="form" className="lm-account-create" id={createId} onSubmit={event => { event.preventDefault(); if (creating && !p.busy && p.name.trim()) p.onSubmit(); }} onKeyDown={event => { if (event.key === "Escape" && !p.busy) { event.preventDefault(); closeCreate(); } }}>
            <TextInput label={p.text.name} value={p.name} maxLength={200} disabled={p.busy} required onChange={e => p.onField("name", e.currentTarget.value)} />
            <Group justify="end" gap="xs" mt="sm"><Button disabled={p.busy} onClick={closeCreate}>{p.text.cancel}</Button><Button type="submit" variant="filled" disabled={p.busy || !p.name.trim()}>{p.text.create}</Button></Group>
          </Box></Box>
        </Box>}
      </Box>
    </Box>
  </Box>;
}
