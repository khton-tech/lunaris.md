import { Box, Text, Title } from "@mantine/core";
import type { AccountAccessProps } from "./account-access.js";

export function AccountHeading({ props: p }: { props: AccountAccessProps }) {
  return <Box component="header" className="lm-account-heading">
    <Title order={1}>{p.text[p.mode]}</Title>
    <Text className="lm-account-context">{p.text[`${p.mode}Detail`]}</Text>
  </Box>;
}
export function AccountError({ props: p }: { props: AccountAccessProps }) {
  return <Text className="lm-account-error" role="alert" hidden={!p.error}>{p.error}</Text>;
}
