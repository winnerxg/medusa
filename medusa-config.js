const { Modules } = require("@medusajs/modules-sdk")

const DB_HOST = process.env.DB_HOST
const DB_USERNAME = process.env.DB_USERNAME
const DB_PASSWORD = process.env.DB_PASSWORD
const DB_NAME = process.env.DB_NAME
const DB_URL = `postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}`
//const DB_URL = `postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}`
process.env.POSTGRES_URL = DB_URL
process.env.LOG_LEVEL = "error"

const JWT_SECRET = process.env.JWT_SECRET
const COOKIE_SECRET = process.env.COOKIE_SECRET


const enableMedusaV2 = process.env.MEDUSA_FF_MEDUSA_V2 == "true"
/*
const customPaymentProvider = {
  resolve: {
    services: [require("@medusajs/payment/dist/providers/system").default],
  },
  options: {
    config: {
      default_2: {},
    },
  },
}
*/
const customFulfillmentProvider = {
  resolve: "@medusajs/fulfillment-manual",
  options: {
    config: {
      "test-provider": {},
    },
  },
}

module.exports = {
  admin: {
    disable: true,
  },
  plugins: [],
  projectConfig: {
    databaseUrl: DB_URL,
    databaseSchema: "public",
    databaseName: DB_NAME,
    databaseType: "postgres",
    databaseLogging: process.env.DB_LOGGING,
    databaseDriverOptions: {
      connection: {
        rejectUnauthorized: true,
      },
    },
    http: {
      jwtExpiresIn: "1d",
      jwtSecret: JWT_SECRET,
      cookieSecret: COOKIE_SECRET,
      authCors: process.env.AUTH_CORS,
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
    },
    redisUrl: process.env.CACHE_REDIS_URL,
    redisPrefix: `{${process.env.CACHE_REDIS_KEY_PREFIX}}`,
    redisOptions: {
      keyPrefix: `{${process.env.CACHE_REDIS_KEY_PREFIX}}`,
    },
    workerMode: process.env.MEDUSA_WORKER_MODE,
    jobsBatchSize: 1000,
  },
  featureFlags: {
    medusa_v2: enableMedusaV2,
    product_categories: true,
    tax_inclusive_pricing: true,
    order_editing: true,
    sales_channels: true,
    publishable_api_keys: true,
  },
  modules: {
    [Modules.AUTH]: true,
    [Modules.USER]: {
      scope: "internal",
      resources: "shared",
      resolve: "@medusajs/user",
      options: {
        jwt_secret: JWT_SECRET,
      },
    },
    [Modules.CACHE]: {
      resolve: "@medusajs/cache-redis",
      options: { 
	      redisUrl: process.env.CACHE_REDIS_URL,
        ttl: 60,
        namespace: "medusa-redis-cache",
        removeOnComplete: true,
        attempts: 1,
      },
    },
    [Modules.EVENT_BUS]: {
      resolve: "@medusajs/event-bus-redis",
      options: { 
        redisUrl: process.env.EVENTS_REDIS_URL,
      },
    },
    [Modules.STOCK_LOCATION]: {
      resolve: "@medusajs/stock-location-next",
      options: {},
    },
    [Modules.INVENTORY]: {
      resolve: "@medusajs/inventory-next",
      options: {},
    },
    [Modules.FILE]: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-local-next",
            options: {
              config: {
                local: {},
              },
            },
          },
        ],
      },
    },
    [Modules.PRODUCT]: true,
    [Modules.PRICING]: true,
    [Modules.PROMOTION]: true,
    [Modules.REGION]: true,
    [Modules.CUSTOMER]: true,
    [Modules.SALES_CHANNEL]: true,
    [Modules.CART]: true,
    [Modules.WORKFLOW_ENGINE]: true,
    [Modules.REGION]: true,
    [Modules.API_KEY]: true,
    [Modules.STORE]: true,
    [Modules.TAX]: true,
    [Modules.CURRENCY]: true,
    [Modules.ORDER]: true,
//    [Modules.PAYMENT]: {
//      resolve: "@medusajs/payment",
//      /** @type {import('@medusajs/payment').PaymentModuleOptions}*/
//      options: {
//        providers: [customPaymentProvider],
//      },
//    },
//    [Modules.FULFILLMENT]: {
//      /** @type {import('@medusajs/fulfillment').FulfillmentModuleOptions} */
//      options: {
//        providers: [customFulfillmentProvider],
//      },
//    },
//    [Modules.NOTIFICATION]: {
//      /** @type {import('@medusajs/types').LocalNotificationServiceOptions} */
//      options: {
//        providers: [
//          {
//            resolve: "@medusajs/notification-local",
//            options: {
//              config: {
//                "local-notification-provider": {
//                  name: "Local Notification Provider",
//                  channels: ["log", "email"],
//                },
//              },
//            },
//          },
//        ],
//      },
//    },
  },
}

