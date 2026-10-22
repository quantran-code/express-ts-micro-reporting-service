export interface ServiceConfig {
  port: number;
  env: string;
  serviceKey: string;
  loanServiceUrl: string;
  catalogServiceUrl: string;
  memberServiceUrl: string;
}

export const config: ServiceConfig = {
  port: Number(process.env.PORT) || 3005,
  env: process.env.NODE_ENV || 'development',
  serviceKey: process.env.SERVICE_KEY || 'dev-service-key',
  loanServiceUrl: process.env.LOAN_SERVICE_URL || 'http://localhost:3004',
  catalogServiceUrl: process.env.CATALOG_SERVICE_URL || 'http://localhost:3002',
  memberServiceUrl: process.env.MEMBER_SERVICE_URL || 'http://localhost:3003',
};
