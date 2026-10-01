const intEnv = (name: string, fallback: number): number =>
  Number.parseInt(process.env[name] ?? String(fallback), 10);

export default () => ({
  port: Number.parseInt(process.env.PORT ?? '3100', 10),
  environment: process.env.NODE_ENV ?? 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  database: {
    host: process.env.RDS_HOSTNAME ?? 'localhost',
    port: Number.parseInt(process.env.RDS_PORT ?? '5432', 10),
    name: process.env.RDS_DBNAME ?? 'mail',
    username: process.env.RDS_USERNAME ?? 'postgres',
    password: process.env.RDS_PASSWORD ?? '',
  },

  stalwart: {
    url: process.env.STALWART_JMAP_URL ?? 'http://localhost:8085',
    adminUrl: process.env.STALWART_ADMIN_URL ?? 'http://localhost:8085',
    adminUser: process.env.STALWART_ADMIN_USER ?? 'mail-api',
    adminSecret: process.env.STALWART_ADMIN_SECRET ?? '',
    masterUser: process.env.STALWART_MASTER_USER ?? 'master',
    masterPassword: process.env.STALWART_MASTER_PASSWORD ?? '',
    smtpHost: process.env.STALWART_SMTP_HOST ?? 'localhost',
    smtpPort: Number.parseInt(process.env.STALWART_SMTP_PORT ?? '465', 10),
    http: {
      connectTimeoutMs: intEnv('STALWART_CONNECT_TIMEOUT_MS', 10_000),
      apiTimeoutMs: intEnv('STALWART_API_TIMEOUT_MS', 45_000),
      blobTimeoutMs: intEnv('STALWART_BLOB_TIMEOUT_MS', 30_000),
      uploadDeadlineMs: intEnv('STALWART_UPLOAD_DEADLINE_MS', 80_000),
      uploadConnections: intEnv('STALWART_UPLOAD_CONNECTIONS', 8),
      downloadConnections: intEnv('STALWART_DOWNLOAD_CONNECTIONS', 16),
    },
  },

  crypto: {
    serverPrivateKey: process.env.SERVER_PRIVATE_KEY ?? '',
  },

  accounts: {
    suspendedRetentionDays: Number.parseInt(
      process.env.SUSPENDED_ACCOUNT_RETENTION_DAYS ?? '30',
      10,
    ),
  },

  secrets: {
    jwt: process.env.JWT_SECRET,
    drivePublicGateway: process.env.GATEWAY_PUBLIC_SECRET,
    bridgePrivateGateway: process.env.BRIDGE_PRIVATE_GATEWAY_SECRET,
  },

  apis: {
    payments: {
      url: process.env.PAYMENTS_API_URL ?? '',
    },
    bridge: {
      url: process.env.BRIDGE_API_URL ?? '',
    },
  },

  stalwartWebhook: {
    username: process.env.STALWART_WEBHOOK_USERNAME ?? 'stalwart',
    secret: process.env.STALWART_WEBHOOK_SECRET ?? '',
  },

  mtaHooks: {
    username: process.env.MTA_HOOKS_USERNAME ?? 'stalwart',
    secret: process.env.MTA_HOOKS_SECRET ?? '',
  },
});
