import { createAccountAccess } from "@lunaris/account-access";
void createAccountAccess({ defaultOpen: true, allowLocal: false });
// @ts-expect-error Server addresses are strings.
createAccountAccess({ defaultAddress: 42 });
