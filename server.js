// Heroes CRUD on Fastify 5 + node-postgres (pg.Pool), pino JSON logs (Fastify's built-in logger), prom-client.
import Fastify from 'fastify';
import pg from 'pg';
import client from 'prom-client';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://heroes:heroes@localhost/heroes',
  max: Number(process.env.POOL_SIZE ?? 16), min: Number(process.env.POOL_SIZE ?? 16),
  statement_timeout: 10000,
});

client.collectDefaultMetrics();
const hist = new client.Histogram({ name: 'http_request_duration_seconds', help: 'request duration',
  labelNames: ['method', 'route', 'status'] });

// Fastify's default per-request logs are two lines (incoming + completed); we log one line like the others.
const app = Fastify({ logger: { level: 'info' }, disableRequestLogging: true,
  connectionTimeout: 10000, requestTimeout: 10000, keepAliveTimeout: 75000 });

app.addHook('onResponse', async (req, reply) => {
  const route = req.routeOptions.url ?? '';
  hist.labels(req.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
  req.log.info({ method: req.method, route, path: req.url, status: reply.statusCode,
    duration_ms: reply.elapsedTime, client: req.ip }, 'request');
});

const COLS = 'id, name, alias, power, mentor';
const hero = { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' },
  alias: { type: 'string' }, power: { type: 'string' }, mentor: { type: ['string', 'null'] } } };
const body = { type: 'object', required: ['name', 'alias', 'power'], properties: { name: { type: 'string' },
  alias: { type: 'string' }, power: { type: 'string' }, mentor: { type: ['string', 'null'] } } };
const idParam = { type: 'object', properties: { id: { type: 'integer' } } };
const fix = (r) => (r && { ...r, id: Number(r.id) });  // bigint arrives as string from pg

app.get('/heroes', { schema: { response: { 200: { type: 'array', items: hero } } } }, async () =>
  (await pool.query({ name: 'list', text: `select ${COLS} from heroes order by id limit 50` })).rows.map(fix));

app.get('/heroes/:id', { schema: { params: idParam, response: { 200: hero } } }, async (req, reply) => {
  const r = await pool.query({ name: 'get', text: `select ${COLS} from heroes where id = $1`, values: [req.params.id] });
  return r.rows.length ? fix(r.rows[0]) : reply.code(404).send({ error: 'not found' });
});

app.post('/heroes', { schema: { body, response: { 201: hero } } }, async (req, reply) => {
  const b = req.body;
  const r = await pool.query({ name: 'ins', text: `insert into heroes (name, alias, power, mentor) values ($1,$2,$3,$4) returning ${COLS}`,
    values: [b.name, b.alias, b.power, b.mentor ?? null] });
  const h = fix(r.rows[0]);
  return reply.code(201).header('location', `/heroes/${h.id}`).send(h);
});

app.put('/heroes/:id', { schema: { params: idParam, body, response: { 200: hero } } }, async (req, reply) => {
  const b = req.body;
  const r = await pool.query({ name: 'upd', text: `update heroes set name=$1, alias=$2, power=$3, mentor=$4 where id=$5 returning ${COLS}`,
    values: [b.name, b.alias, b.power, b.mentor ?? null, req.params.id] });
  return r.rows.length ? fix(r.rows[0]) : reply.code(404).send({ error: 'not found' });
});

app.delete('/heroes/:id', { schema: { params: idParam } }, async (req, reply) => {
  const r = await pool.query({ name: 'del', text: 'delete from heroes where id = $1', values: [req.params.id] });
  return reply.code(r.rowCount ? 204 : 404).send(r.rowCount ? undefined : { error: 'not found' });
});

app.get('/metrics', async (req, reply) => reply.type(client.register.contentType).send(await client.register.metrics()));

app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 8000) });
