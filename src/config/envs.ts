import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT?: number;
  NATS_SERVERS: string;
  DATABASE_URL: string;
  AZURE_STORAGE_CONNECTION_STRING: string;
  AZURE_DOCUMENTS_CONTAINER: string;
}

const envsSchema = joi
  .object<EnvVars>({
    PORT: joi.number().default(3003),
    NATS_SERVERS: joi.string().required(),
    DATABASE_URL: joi.string().required(),
    AZURE_STORAGE_CONNECTION_STRING: joi.string().required(),
    AZURE_DOCUMENTS_CONTAINER: joi.string().default('invoices')
  })
  .unknown(true);

const { error, value: envVars } = envsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const envs = {
  port: envVars.PORT!,
  natsServers: envVars.NATS_SERVERS.split(','),
  databaseUrl: envVars.DATABASE_URL,
  azureStorageConnectionString: envVars.AZURE_STORAGE_CONNECTION_STRING,
  documentsContainerName: envVars.AZURE_DOCUMENTS_CONTAINER
};
