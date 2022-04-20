import fastify from 'fastify';
import deepmerge from 'deepmerge';

import config from '../config.js';
import routes from './routes.js';
import * as qs from './utils/query-string';

type Options = {
  logger?: boolean;
};

export const core = async ({ logger = config.logger }: Options) => {
  const app = fastify({
    logger,
    querystringParser: (str: string) => qs.parse(str),
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: true,
        useDefaults: false,
      },
    },
  });

  app.addHook<{ Querystring: any }>('preValidation', async (request) => {
    if (request.query && request.query.options) {
      request.query = deepmerge(request.query.options, request.query);
    }
  });

  await app.register(routes);

  app.ready((err) => {
    if (err) throw err;
  });

  return app;
};
