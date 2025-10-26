import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT?: number;
  NATS_SERVERS: string;
  DATABASE_URL: string;
}

const envsSchema = joi
  .object<EnvVars>({
    PORT: joi.number().default(3003),
    NATS_SERVERS: joi.string().required(),
    DATABASE_URL: joi.string().required()
  })
  .unknown(true);

const { error, value: envVars } = envsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const envs = {
  port: envVars.PORT!,
  natsServers: envVars.NATS_SERVERS.split(','),
  databaseUrl: envVars.DATABASE_URL
};
