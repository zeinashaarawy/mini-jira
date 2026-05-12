import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();
app.listen(config.port, () => {
  console.log(`Mini Jira API listening on :${config.port}`);
});
