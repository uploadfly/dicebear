import { renderAsync, ResvgRenderOptions } from '@resvg/resvg-js';
import { FastifyPluginCallback } from 'fastify';
import { JSONSchema7 } from 'json-schema';
import { createRequire } from 'module';

// @ts-ignore
import mergeAllOf from 'json-schema-merge-allof';
import { paramCase } from 'param-case';
import config from '../../config.js';
import { AvatarRouteParams, Version } from '../types.js';
import { adjustPngOptions } from '../utils/adjustPngOptions.js';

const require = createRequire(import.meta.url);

type Options = Version;

const paramsSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    seed: {
      type: 'string',
    },
    format: {
      type: 'string',
      enum: ['svg', 'png'],
    },
  },
  required: ['format'],
};

const propertiesOverrideSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    base64: false,
    dataUri: false,
  },
};

const plugin: FastifyPluginCallback<Options> = async (
  app,
  { createAvatar, routes, schema, styles }
) => {
  for (const [styleName, style] of Object.entries(styles)) {
    // Skip private values
    if (styleName[0] === '_' || styleName === 'default') {
      continue;
    }

    // Combine core schema with style schema.
    let queryStringSchema = mergeAllOf(
      {
        allOf: [schema, style.schema, propertiesOverrideSchema],
        additionalItems: true,
      },
      { ignoreAdditionalProperties: true }
    );

    // Create handler for all routes
    for (const route of routes) {
      // Replace ':style' in Route with style name.
      const parsedRoute = route.replace(':style', paramCase(styleName));

      if (parsedRoute === route) {
        throw new Error(`Missing ":style" placeholder in Route "${route}"`);
      }

      // Create GET handler
      app.get<{ Params: AvatarRouteParams }>(
        parsedRoute,
        {
          schema: { querystring: queryStringSchema, params: paramsSchema },
        },
        async (request, reply) => {
          let options: any = request.query;

          const format = request.params.format ?? 'svg';

          // Validate Size for PNG Format
          if (format === 'png') {
            options = adjustPngOptions(options);
          }

          // Define default seed
          options['seed'] = request.params.seed ?? options['seed'] ?? '';

          // Create avatar
          const svg = createAvatar(style, options);

          reply.header(
            'Cache-Control',
            `max-age=${config.cacheControl.avatar}`
          );

          switch (format) {
            case 'svg':
              reply.header('Content-Type', 'image/svg+xml');

              return svg;

            case 'png':
              reply.header('Content-Type', 'image/png');

              const options: ResvgRenderOptions = {};

              if (styleName === 'initials') {
                options.font = {
                  loadSystemFonts: false,
                  defaultFontFamily: 'Inter',
                  fontFiles: [
                    require.resolve('../fonts/inter/inter-regular.otf'),
                    require.resolve('../fonts/inter/inter-bold.otf'),
                  ],
                };
              }

              return await renderAsync(svg, options);
          }
        }
      );
    }
  }
};

export default plugin;
