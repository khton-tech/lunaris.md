import "@lunaris/mantine-components/styles.css";

const id = new URLSearchParams(window.location.search).get("id");
if (id) window.opener?.postMessage(id, window.location.origin);
