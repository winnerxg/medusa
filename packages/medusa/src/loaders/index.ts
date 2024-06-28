import { createDefaultsWorkflow } from "@medusajs/core-flows"
import { ConfigModule, MedusaContainer, PluginDetails } from "@medusajs/types"
import {
  ContainerRegistrationKeys,
  createMedusaContainer,
  promiseAll,
} from "@medusajs/utils"
import { asValue } from "awilix"
import { Express, NextFunction, Request, Response } from "express"
import path from "path"
import requestIp from "request-ip"
import { v4 } from "uuid"
import adminLoader from "./admin"
import apiLoader from "./api"
import loadConfig from "./config"
import expressLoader from "./express"
import featureFlagsLoader from "./feature-flags"
import { registerJobs } from "./helpers/register-jobs"
import { registerWorkflows } from "./helpers/register-workflows"
import { getResolvedPlugins } from "./helpers/resolve-plugins"
import { resolvePluginsLinks } from "./helpers/resolve-plugins-links"
import { SubscriberLoader } from "./helpers/subscribers"
import Logger from "./logger"
import loadMedusaApp from "./medusa-app"
import registerPgConnection from "./pg-connection"

type Options = {
  directory: string
  expressApp: Express
}

const isWorkerMode = (configModule) => {
  return configModule.projectConfig.workerMode === "worker"
}

const shouldLoadBackgroundProcessors = (configModule) => {
  return (
    configModule.projectConfig.workerMode === "worker" ||
    configModule.projectConfig.workerMode === "shared"
  )
}

async function subscribersLoader(
  plugins: PluginDetails[],
  container: MedusaContainer
) {
  /**
   * Load subscribers from the medusa/medusa package
   */
  await new SubscriberLoader(
    path.join(__dirname, "../subscribers"),
    container
  ).load()

  /**
   * Load subscribers from all the plugins.
   */
  await Promise.all(
    plugins.map(async (pluginDetails) => {
      await new SubscriberLoader(
        path.join(pluginDetails.resolve, "subscribers"),
        container
      ).load()
    })
  )
}

async function jobsLoader(plugins: PluginDetails[]) {
  /**
   * Load jobs from the medusa/medusa package. Remove once the medusa core is converted to a plugin
   */
  await registerJobs([{ resolve: path.join(__dirname, "../") }])
  await registerJobs(plugins)
}

async function loadEntrypoints(
  plugins: PluginDetails[],
  container: MedusaContainer,
  expressApp: Express,
  rootDirectory: string
) {
  const configModule: ConfigModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  if (shouldLoadBackgroundProcessors(configModule)) {
    await subscribersLoader(plugins, container)
    await jobsLoader(plugins)
  }

  if (isWorkerMode(configModule)) {
    return async () => {}
  }

  const { shutdown } = await expressLoader({ app: expressApp, configModule })
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    req.scope = container.createScope() as MedusaContainer
    req.requestId = (req.headers["x-request-id"] as string) ?? v4()
    next()
  })

  // Add additional information to context of request
  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    const ipAddress = requestIp.getClientIp(req) as string
    ;(req as any).request_context = {
      ip_address: ipAddress,
    }
    next()
  })

  await adminLoader({ app: expressApp, configModule, rootDirectory })
  await apiLoader({
    container,
    plugins,
    app: expressApp,
  })

  return shutdown
}

export async function initializeContainer(rootDirectory: string) {
  const container = createMedusaContainer()
  const configModule = loadConfig(rootDirectory)
  const featureFlagRouter = featureFlagsLoader(configModule, Logger)

  container.register({
    [ContainerRegistrationKeys.LOGGER]: asValue(Logger),
    [ContainerRegistrationKeys.FEATURE_FLAG_ROUTER]: asValue(featureFlagRouter),
    [ContainerRegistrationKeys.CONFIG_MODULE]: asValue(configModule),
    [ContainerRegistrationKeys.REMOTE_QUERY]: asValue(null),
  })

  await registerPgConnection({ container, configModule })
  return container
}

export default async ({
  directory: rootDirectory,
  expressApp,
}: Options): Promise<{
  container: MedusaContainer
  app: Express
  shutdown: () => Promise<void>
}> => {
  const container = await initializeContainer(rootDirectory)
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const plugins = getResolvedPlugins(rootDirectory, configModule, true) || []
  const pluginLinks = await resolvePluginsLinks(plugins, container)
  await registerWorkflows(plugins)

  const { onApplicationShutdown, onApplicationPrepareShutdown } =
    await loadMedusaApp({
      container,
      linkModules: pluginLinks,
    })

  const entrypointsShutdown = await loadEntrypoints(
    plugins,
    container,
    expressApp,
    rootDirectory
  )
  await createDefaultsWorkflow(container).run()

  const shutdown = async () => {
    const pgConnection = container.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    )

    await onApplicationPrepareShutdown()
    await onApplicationShutdown()

    await promiseAll([
      container.dispose(),
      // @ts-expect-error "Do we want to call `client.destroy` "
      pgConnection?.context?.destroy(),
      entrypointsShutdown(),
    ])
  }

  return {
    container,
    app: expressApp,
    shutdown,
  }
}
