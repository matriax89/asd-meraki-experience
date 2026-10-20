import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(path, mocks) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: (id) => mocks[id] || require(id) });
  return compiledModule.exports;
}

function authorization(options = {}) {
  const state = { role: "admin", ...options };
  const requests = [];
  let identityChecks = 0;
  let serviceClients = 0;
  const admin = { from(table) {
    const request = { table, fields: null, filters: [] };
    requests.push(request);
    return {
      select(fields) { request.fields = fields; return this; },
      eq(field, value) { request.filters.push([field, value]); return this; },
      async single() {
        if (state.profileThrows) throw new Error("Private database failure");
        return {
          data: state.role === null ? null : { role: state.role },
          error: state.profileError ? { message: "Private profile failure" } : null,
        };
      },
    };
  } };
  const authorizationModule = load("lib/commerce/admin-auth.ts", {
    react: React,
    "@/lib/supabase/server": {
      async createClient() {
        if (state.clientThrows) throw new Error("Private connection failure");
        return { auth: { async getUser() {
          identityChecks++;
          return {
            data: { user: state.anonymous ? null : { id: "verified-user-id", email: "private@example.test" } },
            error: state.authError ? { message: "Private auth failure" } : null,
          };
        } } };
      },
      createAdminClient() { serviceClients++; return admin; },
    },
  });
  return { module: authorizationModule, requests, state, admin, identityChecks: () => identityChecks, serviceClients: () => serviceClients };
}

function publicPages(access) {
  const Empty = () => null;
  const server = { async createClient() {
    return { from(table) {
      assert.equal(table, "site_settings");
      return {
        select() { return this; }, eq() { return this; },
        async single() { return { data: { value: { branding: { logo_url: "/brand.png" } } }, error: null }; },
      };
    } };
  } };
  const Surface = () => null;
  const Profile = () => null;
  const { default: Layout } = load("app/[locale]/(public)/layout.tsx", {
    "next-intl/server": { getLocale: async () => "it" },
    "@/lib/supabase/server": server,
    "@/lib/commerce/admin-auth": access,
    "@/components/meraki/public-surface": { PublicSurface: Surface },
    "@/components/public/header": { Header: Empty },
    "@/components/public/footer": { Footer: Empty },
    "@/components/public/cookie-banner": { CookieBanner: Empty },
    "@/components/public/global-popup": { GlobalPopup: Empty },
  });
  const { default: Page, generateMetadata } = load("app/[locale]/(public)/profilo/page.tsx", {
    "@/lib/commerce/admin-auth": access,
    "@/components/meraki/profile": { MerakiProfile: Profile },
  });
  return { Layout, Page, generateMetadata, Surface, Profile };
}

for (const [label, options, expected] of [
  ["anonymous", { anonymous: true }, false],
  ["customer", { role: "customer" }, false],
  ["viewer", { role: "viewer" }, false],
  ["missing profile", { role: null }, false],
  ["admin", { role: "admin" }, true],
  ["editor", { role: "editor" }, true],
  ["unverified identity", { role: "admin", authError: true }, false],
  ["profile query failure", { role: "admin", profileError: true }, false],
  ["profile exception", { role: "admin", profileThrows: true }, false],
  ["connection exception", { clientThrows: true }, false],
]) {
  test(`public server surfaces expose only the verified staff flag for ${label}`, async () => {
    const fixture = authorization(options);
    assert.equal(await fixture.module.hasCommerceStaffAccess(), expected);
    const pages = publicPages(fixture.module);
    const layout = await pages.Layout({ children: "Public content" });
    const surface = React.Children.toArray(layout.props.children).find((child) => child.type === pages.Surface);
    assert.ok(surface);
    assert.equal(surface.props.staffAccess, expected);
    assert.equal(surface.props.logoUrl, "/brand.png");
    assert.equal(surface.props.children, "Public content");
    const profile = await pages.Page({ params: Promise.resolve({ locale: "es" }) });
    assert.equal(profile.type, pages.Profile);
    assert.deepEqual(Object.keys(profile.props).sort(), ["locale", "staffAccess"]);
    assert.equal(profile.props.staffAccess, expected);
    assert.equal(profile.props.locale, "es");
    assert.equal(JSON.stringify(profile.props).includes("private"), false);
    for (const request of fixture.requests) {
      assert.equal(request.table, "profiles");
      assert.equal(request.fields, "role");
      assert.deepEqual(request.filters, [["id", "verified-user-id"]]);
    }
    if (options.anonymous || options.authError || options.clientThrows) {
      assert.equal(fixture.serviceClients(), 0, "an unverified identity must not reach a service-role query");
      assert.equal(fixture.requests.length, 0);
    }
  });
}

test("navigation permission is not globally retained after staff revocation", async () => {
  const fixture = authorization({ role: "admin" });
  assert.equal(await fixture.module.hasCommerceStaffAccess(), true);
  fixture.state.role = "viewer";
  assert.equal(await fixture.module.hasCommerceStaffAccess(), false);
  assert.equal(fixture.identityChecks(), 2);
});

test("the authorization guard still rejects private commerce reads independently of public navigation", async () => {
  const denied = authorization({ role: "viewer" });
  await assert.rejects(denied.module.requireCommerceStaff(), /non autorizzato/);
  assert.equal(await denied.module.hasCommerceStaffAccess(), false);
  const staff = authorization({ role: "editor" });
  assert.equal(await staff.module.requireCommerceStaff(), staff.admin);
});

test("Spanish metadata names the public information page", async () => {
  const pages = publicPages({ hasCommerceStaffAccess: async () => false });
  assert.equal((await pages.generateMetadata({ params: Promise.resolve({ locale: "es" }) })).title, "Información · Meraki");
});
