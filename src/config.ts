export interface ServiceConfig {
  port: number;
  env: string;
  serviceKey: string;
}

export const config: ServiceConfig = {
  port: Number(process.env.PORT) || 3005,
  env: process.env.NODE_ENV || 'development',
  serviceKey: process.env.SERVICE_KEY || 'dev-service-key',
};
