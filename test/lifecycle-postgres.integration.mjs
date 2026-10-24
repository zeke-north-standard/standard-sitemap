/* eslint-env node, es2022 */
/** Explicit opt-in only:
 * node --test test/lifecycle-postgres.integration.mjs
 * SITEMAP_LIFECYCLE_FIXTURE_URL must name a fresh, exclusive random schema.
 * No URL is logged. All Shopify/Resend operations are mocked. Normal Vitest
 * never selects this .integration.mjs file and remains network-free.
 */
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { Session } = require('@shopify/shopify-api');
const fixtureUrl = process.env.SITEMAP_LIFECYCLE_FIXTURE_URL;
let schema;
if (fixtureUrl) {
  let parsed;
  try { parsed = new URL(fixtureUrl); } catch { throw new Error('Invalid isolated Sitemap lifecycle fixture configuration.'); }
  schema = parsed.searchParams.get('schema');
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol) || !/^sitemap_lifecycle_[a-f0-9]{24,}$/.test(schema ?? '')) {
    throw new Error('Refusing an unisolated Sitemap lifecycle fixture schema.');
  }
}
const A = 'fixture-a.myshopify.com';
const B = 'fixture-b.myshopify.com';
const EMAIL = 'owner@fixture.invalid';
const OLD = 'old-fixture-contact-id';
let db, second, provision, createdSchema = false, contacts, providerCalls, deleteImpl, upsertImpl;

async function requireFixtureSchema(client) {
  const current = await client.$queryRawUnsafe('SELECT current_schema() AS name');
  if (current[0]?.name !== schema) {
    const error = new Error('Refusing a lifecycle fixture operation outside its owned schema.');
    error.fixtureSchemaActual = /^[a-zA-Z0-9_]{1,100}$/.test(current[0]?.name ?? '') ? current[0].name : 'unavailable';
    throw error;
  }
}

// Check the transaction's actual connection before each delegate operation,
// and check raw migration/DML calls too. The provisioning client is separate.
async function enterFixtureSchema(tx) {
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
  await requireFixtureSchema(tx);
}

function guardedClient(client, inTransaction = false) {
  const models = new Set(['marketingSubscription', 'sitemapShop', 'sitemapChunk', 'session', 'appOperationLock']);
  return new Proxy(client, { get(target, name) {
    if (name === '$transaction') return (work, options) => {
      if (typeof work !== 'function') throw new Error('Fixture transactions must use callback isolation.');
      if (inTransaction) throw new Error('Nested fixture transactions are not supported.');
      return target.$transaction(async tx => { await enterFixtureSchema(tx); return work(guardedClient(tx, true)); }, options);
    };
    if (models.has(name)) return new Proxy(target[name], { get(delegate, operation) {
      const value = delegate[operation];
      if (typeof value !== 'function') return value;
      return async (...args) => {
        if (inTransaction) { await requireFixtureSchema(target); return value.apply(delegate, args); }
        return target.$transaction(async tx => { await enterFixtureSchema(tx); return tx[name][operation](...args); }, { timeout: 10_000 });
      };
    } });
    if (['$executeRawUnsafe', '$executeRaw', '$queryRawUnsafe', '$queryRaw'].includes(name)) return async (...args) => {
      if (inTransaction) { await requireFixtureSchema(target); return target[name](...args); }
      return target.$transaction(async tx => { await enterFixtureSchema(tx); return tx[name](...args); }, { timeout: 10_000 });
    };
    const value = Reflect.get(target, name); return typeof value === 'function' ? value.bind(target) : value;
  } });
}

function compile(relative, dependencies, env = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const evaluate = new vm.Script(`(function(require,module,exports){${source}\n})`, { filename }).runInNewContext({
    process: { env }, Buffer, URL, Response, Request, AbortSignal, Date, setTimeout, clearTimeout, console,
    fetch: async () => { throw new Error('Unexpected network request in isolated lifecycle fixture.'); },
  });
  evaluate((name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('node:') || name.startsWith('@shopify/')) return require(name);
    throw new Error(`Unexpected isolated fixture dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const consent = compile('../app/models/marketing-consent.ts', {});
function modules(database) {
  let marketing;
  const core = compile('../app/services/shop-lifecycle.server.ts', {
    './cleanup-webhook.server': { getLifecycleApi: () => { throw new Error('Unexpected real Shopify API access.'); }, lifecycleCredentialFingerprint: () => 'fixture-epoch' },
    '../models/marketing-consent.server': { eraseMarketingSubscriptionInTransaction: (...args) => marketing.eraseMarketingSubscriptionInTransaction(...args) },
  });
  const provider = {
    getResendContact: async email => {
      providerCalls.push(['GET', email]);
      const found = [...contacts].find(([, value]) => value.email === email);
      return found ? { id: found[0] } : null;
    },
    deleteResendContact: async id => { providerCalls.push(['DELETE', id]); return deleteImpl(id); },
    upsertResendContact: async email => { providerCalls.push(['UPSERT', email]); return upsertImpl(email); },
    unsubscribeResendContact: async id => { providerCalls.push(['UNSUBSCRIBE', id]); const value = contacts.get(id); if (value) value.unsubscribed = true; },
    sendMarketingWelcomeEmail: async () => ({ sent: false, reason: 'POSTAL_ADDRESS_MISSING' }),
  };
  marketing = compile('../app/models/marketing-consent.server.ts', {
    '~/db.server': { __esModule: true, default: database }, '~/services/shop-lifecycle.server': core,
    '~/models/marketing-consent': consent, '~/models/resend.server': provider,
  });
  return { core, marketing };
}

const session = (shop = A, token = 'synthetic-revoked-token') => new Session({
  id: `offline_${shop}`, shop, state: 'fixture', isOnline: false, accessToken: token,
  expires: new Date(Date.now() + 3600000),
});
function authority() {
  const revoked = new Set();
  return { revoked, probe: async current => revoked.has(current.accessToken) ? 'revoked' : 'active', credentialFingerprint: () => 'fixture-epoch', requiredScopes: () => [] };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function seedMarketing(shop = A, values = {}) {
  const now = new Date('2026-10-01T00:00:00Z');
  return db.marketingSubscription.create({ data: {
    shop, email: EMAIL, status: 'SUBSCRIBED', consentedAt: now, consentSource: 'isolated-fixture', consentVersion: 'fixture',
    unsubscribeToken: `synthetic-token-${shop}`, resendContactId: OLD, resendContactEmail: EMAIL, resendContactSyncedAt: now,
    resendSyncStatus: 'SYNCED', resendSyncedAt: now, welcomeEmailSentAt: now, ...values,
  } });
}
async function seedRevoked(app, remote, shop = A) {
  await app.core.createLifecycleSessionStorage(db, remote).storeSession(session(shop));
  remote.revoked.add('synthetic-revoked-token');
  await db.sitemapShop.create({ data: { shop, configJson: '{}' } });
  await seedMarketing(shop);
  contacts.set(OLD, { email: EMAIL, unsubscribed: false });
}
async function assertPreserved(shop = A) {
  assert.equal(await db.session.count({ where: { shop } }), 1);
  assert.equal(await db.sitemapShop.count({ where: { shop } }), 1);
}
const json = value => JSON.parse(JSON.stringify(value));

before(async () => {
  if (!fixtureUrl) return;
  provision = new PrismaClient({ datasourceUrl: fixtureUrl });
  let setupStage = 'create_schema';
  try {
    // No IF NOT EXISTS: failure cannot grant ownership of an existing schema.
    await provision.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    createdSchema = true;
    // Prisma may have fallen back to public when connecting before CREATE.
    // Never reuse that physical connection for migrations or application data.
    setupStage = 'disconnect_provision';
    await provision.$disconnect();
    db = guardedClient(new PrismaClient({ datasourceUrl: fixtureUrl }));
    second = guardedClient(new PrismaClient({ datasourceUrl: fixtureUrl }));
    setupStage = 'check_primary_schema';
    await requireFixtureSchema(db);
    setupStage = 'check_secondary_schema';
    await requireFixtureSchema(second);
    const migrations = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
    await db.$transaction(async tx => {
      for (const name of fs.readdirSync(migrations).sort()) {
        const file = path.join(migrations, name, 'migration.sql');
        if (!fs.existsSync(file)) continue;
        let statementIndex = 0;
        for (const statement of fs.readFileSync(file, 'utf8').split(';').map(sql => sql.trim()).filter(Boolean)) {
          setupStage = `migration_${name}_${statementIndex++}`;
          await tx.$executeRawUnsafe(statement);
        }
      }
    }, { timeout: 30_000 });
  } catch (error) {
    const prismaCode = /^[A-Z][0-9]{4}$/.test(error?.code ?? '') ? error.code : 'unavailable';
    const sqlState = /^[A-Z0-9]{5}$/.test(error?.meta?.code ?? '') ? error.meta.code : 'unavailable';
    const actual = error?.fixtureSchemaActual ?? 'unavailable';
    throw new Error(`Isolated Sitemap fixture setup refused: stage=${setupStage}; prisma=${prismaCode}; sqlstate=${sqlState}; actual_schema=${actual}. Connection details omitted.`);
  }
});

beforeEach(async () => {
  if (!fixtureUrl) return;
  for (const model of ['marketingSubscription', 'sitemapShop', 'session', 'appOperationLock']) await db[model].deleteMany();
  contacts = new Map(); providerCalls = [];
  deleteImpl = async id => { contacts.delete(id); };
  upsertImpl = async email => {
    const found = [...contacts].find(([, value]) => value.email === email);
    const id = found?.[0] ?? `new-fixture-id-${providerCalls.length}`;
    contacts.set(id, { email, unsubscribed: false }); return { id };
  };
});

after(async () => {
  await second?.$disconnect();
  await db?.$disconnect();
  try {
    // The validated identifier and successful CREATE above establish ownership.
    if (createdSchema) await provision.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  } finally { await provision?.$disconnect(); }
});

const integration = (name, work) => test(name, { skip: !fixtureUrl }, work);

integration('separate PostgreSQL clients serialize fresh session storage before stale cleanup', async () => {
  assert.notEqual(db, second);
  const app = modules(db), other = modules(second), remote = authority();
  await db.sitemapShop.create({ data: { shop: A, configJson: '{}' } });
  const entered = deferred(), release = deferred();
  remote.probe = async () => { entered.resolve(); await release.promise; return 'active'; };
  const storing = app.core.createLifecycleSessionStorage(db, remote).storeSession(session(A, 'synthetic-fresh-token'));
  await entered.promise;
  const cleaning = other.core.cleanupShopLifecycle(second, A, remote);
  setTimeout(() => release.resolve(), 40);
  await storing;
  assert.equal(await cleaning, 'active');
  await assertPreserved();
});

integration('provider failure commits immutable intent and preserves sessions/sitemap until retry succeeds', async () => {
  const app = modules(db), remote = authority(); await seedRevoked(app, remote);
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote), error => error.reason === 'PROVIDER_ERASURE_PENDING');
  assert.equal(providerCalls.filter(call => call[0] === 'DELETE').length, 0);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).resendErasureContactId, OLD);
  await assertPreserved();
  deleteImpl = async id => {
    assert.equal((await second.marketingSubscription.findUnique({ where: { shop: A } })).resendErasureContactId, id);
    throw new Error('Synthetic provider timeout');
  };
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote), error => error.reason === 'PROVIDER_ERASURE_PENDING');
  await assertPreserved();
  deleteImpl = async id => { contacts.delete(id); };
  assert.equal(await app.core.cleanupShopLifecycle(db, A, remote), 'erased');
  assert.equal(await db.marketingSubscription.count(), 0); assert.equal(await db.session.count(), 0); assert.equal(await db.sitemapShop.count(), 0);
});

integration('a rolled-back staging transaction never dispatches a destructive provider request', async () => {
  const app = modules(db), remote = authority(); await seedRevoked(app, remote);
  let fail = true;
  const wrapped = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return (work, options) => target.$transaction(async tx => { const value = await work(tx); if (fail) { fail = false; throw new Error('Synthetic commit rollback'); } return value; }, options);
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(app.core.cleanupShopLifecycle(wrapped, A, remote), /Synthetic commit rollback/);
  assert.equal(providerCalls.filter(call => call[0] === 'DELETE').length, 0);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).resendErasurePending, false);
  await assertPreserved();
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote), error => error.reason === 'PROVIDER_ERASURE_PENDING');
  assert.equal(providerCalls.filter(call => call[0] === 'DELETE').length, 0);
});

for (const newEmail of [EMAIL, 'replacement@fixture.invalid']) integration(`late immutable-ID DELETE cannot erase a fresh installation/contact for ${newEmail}`, async () => {
  const app = modules(db), other = modules(second), remote = authority(); await seedRevoked(app, remote);
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote));
  const entered = deferred(), abort = deferred();
  let first = true;
  deleteImpl = async id => { if (first) { first = false; entered.resolve(); await abort.promise; } contacts.delete(id); };
  const cleaning = app.core.cleanupShopLifecycle(db, A, remote).catch(error => error);
  await entered.promise;
  const reinstalling = other.core.createLifecycleSessionStorage(second, remote).storeSession(session(A, 'synthetic-reinstalled-token'));
  const subscribing = reinstalling.then(() => other.marketing.subscribeToMarketing(A, newEmail));
  abort.reject(new Error('Synthetic request abort; remote completion unknown'));
  await cleaning; await subscribing;
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).resendErasureContactId, OLD);
  await other.marketing.syncMarketingSubscription(A);
  const replacement = (await db.marketingSubscription.findUnique({ where: { shop: A } })).resendContactId;
  assert.notEqual(replacement, OLD); assert.ok(contacts.has(replacement));
  contacts.delete(OLD); // Late completion of the first HTTP request.
  assert.ok(contacts.has(replacement));
  assert.equal(await app.core.cleanupShopLifecycle(db, A, remote), 'active');
  await assertPreserved();
});

integration('shared-email fresh local consent does not discard another shop pending retirement', async () => {
  const app = modules(db), other = modules(second), remote = authority(); await seedRevoked(app, remote);
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote));
  deleteImpl = async () => { throw new Error('Synthetic provider timeout'); };
  await assert.rejects(app.core.cleanupShopLifecycle(db, A, remote));
  await other.marketing.subscribeToMarketing(B, EMAIL);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: B } })).resendContactSyncedAt, null);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).resendErasureContactId, OLD);
  deleteImpl = async id => { contacts.delete(id); };
  assert.equal(await app.core.cleanupShopLifecycle(db, A, remote), 'erased');
  await other.marketing.syncMarketingSubscription(B);
  const replacement = (await db.marketingSubscription.findUnique({ where: { shop: B } })).resendContactId;
  assert.notEqual(replacement, OLD); contacts.delete(OLD); assert.ok(contacts.has(replacement));
});

integration('another shop confirmed on the same provider ID survives tenant cleanup', async () => {
  const app = modules(db), remote = authority(); await seedRevoked(app, remote); await seedMarketing(B);
  assert.equal(await app.core.cleanupShopLifecycle(db, A, remote), 'erased');
  assert.equal(providerCalls.filter(call => call[0] === 'DELETE').length, 0);
  assert.ok(contacts.has(OLD)); assert.equal((await db.marketingSubscription.findUnique({ where: { shop: B } })).status, 'SUBSCRIBED');
});

integration('a delayed authenticated old-ID contact webhook cannot revoke the replacement', async () => {
  const app = modules(db), other = modules(second);
  await seedMarketing(A, { resendContactId: 'replacement-provider-id' });
  const secretKey = Buffer.from('synthetic-contact-webhook-key');
  const verification = compile('../app/models/resend-webhook.server.ts', {});
  const route = compile('../app/routes/webhooks.resend.tsx', {
    '~/models/marketing-consent.server': other.marketing, '~/models/resend-webhook.server': verification,
    '~/models/marketing-consent': consent,
  }, { RESEND_WEBHOOK_SECRET: `whsec_${secretKey.toString('base64')}` });
  const request = id => {
    const payload = JSON.stringify({ type: 'contact.deleted', data: { id, email: EMAIL } });
    const timestamp = String(Math.floor(Date.now() / 1000)), eventId = 'synthetic-contact-event';
    return new Request('https://fixture.invalid/webhooks/resend', { method: 'POST', body: payload, headers: {
      'svix-id': eventId, 'svix-timestamp': timestamp,
      'svix-signature': `v1,${createHmac('sha256', secretKey).update(`${eventId}.${timestamp}.${payload}`).digest('base64')}`,
    } });
  };
  assert.equal((await route.action({ request: request(OLD) })).status, 200);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).status, 'SUBSCRIBED');
  assert.equal((await route.action({ request: request('replacement-provider-id') })).status, 200);
  assert.equal((await db.marketingSubscription.findUnique({ where: { shop: A } })).status, 'UNSUBSCRIBED');
  assert.deepEqual(json(await app.marketing.getMarketingSubscription('missing-fixture.myshopify.com')), null);
});
