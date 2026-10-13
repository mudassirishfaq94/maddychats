// Runs inside the web container. Credentials never appear in command arguments.
try {
  if (!process.env.HEALTHCHECK_SECRET) throw new Error("missing configuration");
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/ready`, {
    headers: { authorization: `Bearer ${process.env.HEALTHCHECK_SECRET}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || (await response.json()).ok !== true) throw new Error("unready");
} catch {
  console.error("Application is not ready");
  process.exitCode = 1;
}
