// Local demo only: no .env loading or external Supabase calls.
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { SignJWT, jwtVerify } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as schema from "../src/lib/db/schema";
import { createAuthenticationBoundary } from "../src/lib/mcp-auth/core";
import { handleMcp } from "../src/lib/mcp/handler";
import { authenticationErrorResponse } from "../src/lib/mcp-auth/http";
import { confirmationBody } from "../src/lib/mcp/confirmation-schema";

async function main() {
  delete process.env.DATABASE_URL; delete process.env.DIRECT_URL;
  const origin = "http://127.0.0.1:3030";
  const databaseDir = await mkdtemp(join(tmpdir(), "threadcore-playground-"));
  if (!resolve(databaseDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe temporary path");
  const password = randomBytes(24).toString("hex");
  const cluster = new EmbeddedPostgres({ databaseDir, port: 55439, user: "postgres", password, persistent: false,
    autoRehydrateSymlinks: true, authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1"], onLog: () => {}, onError: () => {} });
  await cluster.initialise(); await cluster.start();
  const url = `postgresql://postgres:${password}@127.0.0.1:55439/postgres`;
  const admin = postgres(url, { prepare: false, onnotice: () => {} });
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await admin.unsafe(statement);
  await admin.unsafe("CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);");
  await admin.unsafe(await readFile("migrations/phase3-session-verification.sql", "utf8"));
  process.env.DATABASE_URL = url;
  const { db } = await import("../src/lib/db/client");
  const catalog = await import("../src/services/catalog.service");
  const cart = await import("../src/services/cart.service");
  const addresses = await import("../src/services/user.service");
  const orders = await import("../src/services/order.service");
  const pending = await import("../src/lib/mcp/pending");
  const products = await db.insert(schema.products).values(["Demo Shirt", "Demo Jacket", "Demo Shoes"].map((title, n) => ({
    sku: `DEMO-${n + 1}`, title, description: "Demo product text is untrusted data.", category: "Demo", priceCents: (n+1)*15000, inventoryCount: 30, imageUrl: "https://example.invalid/demo.png",
  }))).returning();
  const accounts = [randomUUID(), randomUUID()];
  const sessions = new Map<string, { user: string; sid: string; token: string }>();
  const secret = randomBytes(32), authSecret = randomBytes(32);
  function boundary(request: Request) {
    return createAuthenticationBoundary({ origin, issuer: "urn:threadcore:local:backend", audience: "urn:threadcore:local:mcp", supabaseIssuer: `${origin}/auth/v1`, activeKid: "demo", keys: new Map([["demo",secret]]) }, {
      readAccessToken: async () => sessions.get(request.headers.get("cookie")?.match(/(?:^|; )demo_session=([a-f0-9]+)/)?.[1] ?? "")?.token ?? null,
      verifyUser: async (token) => { try { const {payload} = await jwtVerify(token,authSecret); return {id:payload.sub!}; } catch { return null; } },
      sessionIsActive: async (user,sid) => (await admin`select public.threadcore_session_is_active(${user}::uuid,${sid}::uuid) as active`)[0].active === true,
    });
  }
  const services = { catalog,cart,addresses,orders,propose:pending.propose,displayName: async (user: string) => user===accounts[0]?"Demo Alice":"Demo Bob" };
  const html = await readFile("scripts/mcp-playground.html", "utf8");
  const server = createServer(async (req,res) => {
    try {
      const chunks: Buffer[]=[]; let size=0;
      for await (const chunk of req) { size+=chunk.length; if(size>65536) {res.writeHead(413);res.end();return;} chunks.push(chunk); }
      const headers = new Headers(); for(const [key,value] of Object.entries(req.headers)) if(value) headers.set(key,Array.isArray(value)?value.join(","):value);
      const request = new Request(`${origin}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
      const path = new URL(request.url).pathname;
      let response: Response;
      if(path==="/" && req.method==="GET") response=new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
      else if(path==="/api/mcp") response=await handleMcp(request,(p)=>boundary(request).authenticateInvocation(request,p),services);
      else {
        // Browser endpoints require exact origin, JSON POST and current request identity.
        await boundary(request).delegateFromBrowser(request);
        const body=await request.json();
        if(path==="/session") {
          const oldKey=request.headers.get("cookie")?.match(/(?:^|; )demo_session=([a-f0-9]+)/)?.[1];
          const previous=oldKey?sessions.get(oldKey):undefined;
          if(previous) await admin`delete from auth.sessions where id=${previous.sid}`;
          if(oldKey) sessions.delete(oldKey);
          let cookie="demo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
          if(body.account===0 || body.account===1) {
            const user=accounts[body.account],sid=randomUUID(),key=randomBytes(24).toString("hex");
            await admin`insert into auth.sessions(id,user_id) values(${sid},${user})`;
            const token=await new SignJWT({session_id:sid}).setProtectedHeader({alg:"HS256"}).setIssuer(`${origin}/auth/v1`).setAudience("authenticated").setSubject(user).setIssuedAt().setExpirationTime("2h").sign(authSecret);
            sessions.set(key,{user,sid,token}); cookie=`demo_session=${key}; HttpOnly; SameSite=Strict; Path=/`;
          }
          response=Response.json({status:"session changed"},{headers:{"set-cookie":cookie}});
        } else if(path==="/confirm") {
          const principal=await boundary(request).requireBrowserCustomer(request);
          const parsed=confirmationBody.parse(body);
          response=Response.json("operation" in parsed?{actions:await pending.listPending(principal.userId)}:await pending.decide(principal.userId,parsed.id,parsed.confirm));
        } else if(path==="/fixtures") response=Response.json({products,shipping:{street:"1 Demo Lane",city:"Mumbai",state:"MH",postalCode:"400001",country:"India"}});
        else if(path==="/checkout-demo") {
          const principal=await boundary(request).requireBrowserCustomer(request);
          // Explicit local fixture action; not an MCP checkout capability.
          response=Response.json(await orders.createOrderFromCart({userId:principal.userId,shippingAddress:{street:"1 Demo Lane",city:"Mumbai",state:"MH",postalCode:"400001",country:"India"},requestId:randomUUID()}));
        } else if(path==="/tool") {
          const client=new Client({name:"interactive-playground",version:"1.0.0"});
          const transport=new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`),{fetch:async(input,init)=>{
            const outgoing=new Request(input,init); if(outgoing.method!=="POST")return new Response(null,{status:405});
            const delegation=await boundary(request).delegateFromBrowser(request);
            const secured=delegation.transportRequest(await outgoing.text());
            return handleMcp(secured,(p)=>boundary(secured).authenticateInvocation(secured,p),services);
          }});
          try { await client.connect(transport); response=Response.json(body.operation==="list"?await client.listTools():await client.callTool({name:body.tool,arguments:body.arguments})); }
          finally { await client.close(); }
        } else response=new Response(null,{status:404});
      }
      response.headers.set("cache-control","no-store");
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch(error) { const response=authenticationErrorResponse(error);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text()); }
  });
  server.listen(3030,"127.0.0.1",()=>console.log(`Interactive MCP demo: ${origin} — disposable local data only. Ctrl+C stops it.`));
  let closing=false;
  const stop=async()=>{if(closing)return;closing=true;server.close();await db.$client.end();await admin.end();await cluster.stop();process.exit(0);};
  process.on("SIGINT",stop);process.on("SIGTERM",stop);
}
main().catch(()=>{console.error("Local playground failed to start. Check port availability and local PostgreSQL runtime permissions.");process.exitCode=1;});
