export default () => ({
  port: parseInt(process.env.PORT ?? '3100', 10),
  environment: process.env.NODE_ENV ?? 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  stalwart: {
    url: process.env.STALWART_JMAP_URL ?? 'http://localhost:8085',
    adminUrl: process.env.STALWART_ADMIN_URL ?? 'http://localhost:8085',
    adminToken: process.env.STALWART_ADMIN_TOKEN ?? '',
  },

  secrets: {
    jwt: process.env.JWT_SECRET ?? '',
    gateway: process.env.GATEWAY_SECRET ?? '',
  },

  apis: {
    drive: {
      url: process.env.DRIVE_API_URL ?? '',
    },
  },
});
