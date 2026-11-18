// Read-only metadata, no credentials or customer rows are printed.
import postgres from "postgres";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = postgres(process.env.DATABASE_URL, {
    prepare: false, max: 1, connect_timeout: 10, idle_timeout: 2, ssl: "verify-full",
  });
  try {
    const result = await connection.begin("read only", async (tx) => ({
      role: await tx`select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname=current_user`,
      tables: await tx`select c.relname as table_name, pg_get_userbyid(c.relowner) as owner,
        c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'`,
      policies: await tx`select schemaname, tablename, policyname, roles, cmd from pg_policies where schemaname='public'`,
      grants: await tx`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public'`,
    }));
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.end(); }
}
main().catch((error: unknown) => {
  // Avoid printing connection errors containing hosts, connection URLs, or SQL data.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  console.error(`Read-only database inspection failed (${code}); no credentials printed.`);
  process.exitCode = 1;
});
