import { app } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./db.js";

await connectDatabase();
app.listen(config.PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "PACT API listening",
      port: config.PORT,
    }),
  );
});
