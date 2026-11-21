import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261121000000_initial.sql";
const bootstrapSql = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public
    grant all on tables to anon, authenticated;
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`;

const aliceId = "00000000-0000-4000-8000-000000000001";
const bobId = "00000000-0000-4000-8000-000000000002";
const outsiderId = "00000000-0000-4000-8000-000000000003";

describe("ride store row security", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(bootstrapSql);
    await database.exec(await readFile(migrationPath));
    await database.query(
      `insert into auth.users (id, raw_user_meta_data)
       values ($1, $2::jsonb), ($3, $4::jsonb), ($5, $6::jsonb)`,
      [
        aliceId,
        JSON.stringify({ display_name: "あおい" }),
        bobId,
        JSON.stringify({ display_name: "はる" }),
        outsiderId,
        JSON.stringify({ display_name: "そら" }),
      ],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("keeps ride details private while group members can read totals", async () => {
    const alice = await asUser(aliceId);
    const identity = await alice.query<{ user_id: string }>(
      "select auth.uid() as user_id",
    );
    expect(identity.rows[0].user_id).toBe(aliceId);
    const group = await alice.query<{ group_id: string }>(
      "select public.create_group($1) as group_id",
      ["おでかけ仲間"],
    );
    const groupId = group.rows[0].group_id;

    await alice.query(
      `insert into public.ride_records
        (user_id, route_id, boarded_stop_id, alighted_stop_id, ride_date, distance_km)
       values ($1, 'route-a', 'stop-1', 'stop-3', '2026-11-20', 4.25)`,
      [aliceId],
    );

    const bob = await asUser(bobId);
    await database.exec("reset role");
    await database.query(
      "insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member')",
      [groupId, bobId],
    );

    const bobUser = await asUser(bobId);
    const visibleGroups = await bobUser.query(
      "select name from public.groups",
    );
    expect(visibleGroups.rows).toEqual([{ name: "おでかけ仲間" }]);

    const privateRides = await bob.query(
      "select * from public.ride_records order by ride_date",
    );
    expect(privateRides.rows).toEqual([]);
    const privateProfiles = await bobUser.query(
      "select * from public.profiles",
    );
    expect(privateProfiles.rows).toHaveLength(1);
    await expect(
      bobUser.query("select * from public.group_members"),
    ).rejects.toThrow();

    const totals = await bobUser.query<{
      display_name: string;
      total_distance_km: number;
    }>(
      "select * from public.group_distance_totals($1)",
      [groupId],
    );
    expect(totals.rows).toEqual([
      { display_name: "あおい", total_distance_km: 4.25 },
      { display_name: "はる", total_distance_km: 0 },
    ]);

    await expect(
      bobUser.query(
        `insert into public.ride_records
          (user_id, route_id, boarded_stop_id, alighted_stop_id, ride_date, distance_km)
         values ($1, 'route-a', 'stop-1', 'stop-2', '2026-11-21', 1)`,
        [aliceId],
      ),
    ).rejects.toThrow();
  });

  it("does not return group totals to a non-member", async () => {
    const alice = await asUser(aliceId);
    const group = await alice.query<{ group_id: string }>(
      "select public.create_group($1) as group_id",
      ["おでかけ仲間"],
    );

    const outsider = await asUser(outsiderId);
    const totals = await outsider.query(
      "select * from public.group_distance_totals($1)",
      [group.rows[0].group_id],
    );
    expect(totals.rows).toEqual([]);
    const visibleGroups = await outsider.query("select * from public.groups");
    expect(visibleGroups.rows).toEqual([]);

    await database.exec("reset role");
    await database.exec("set role anon");
    await expect(
      database.query(
        "select * from public.group_distance_totals($1)",
        [group.rows[0].group_id],
      ),
    ).rejects.toThrow();
    await expect(
      database.query("select public.create_group('anonymous')"),
    ).rejects.toThrow();
  });

  it("creates a private profile from signup metadata and requires its display name", async () => {
    const alice = await asUser(aliceId);
    const profile = await alice.query(
      "select display_name from public.profiles",
    );
    expect(profile.rows).toEqual([{ display_name: "あおい" }]);

    await database.exec("reset role");
    await expect(
      database.query("insert into auth.users (id) values ($1)", [
        "00000000-0000-4000-8000-000000000004",
      ]),
    ).rejects.toThrow();
  });

  async function asUser(userId: string) {
    await database.exec("reset role");
    await database.query(
      "select set_config('request.jwt.claim.sub', $1, false)",
      [userId],
    );
    await database.exec("set role authenticated");
    return database;
  }
});

async function readFile(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}
