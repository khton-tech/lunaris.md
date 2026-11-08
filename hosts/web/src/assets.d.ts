declare module "*.txt?raw" { const text: string; export default text; }
declare module "@lunaris/mantine-components/styles.css";
declare module "@lunaris/application-host/shell.css";
declare const __LUNARIS_BUILD_ID__: string;
declare const __LUNARIS_FEATURES__: readonly ("editor" | "files" | "settings")[];
