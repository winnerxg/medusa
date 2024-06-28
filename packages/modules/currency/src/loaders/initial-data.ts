import { ModuleRegistrationName } from "@medusajs/modules-sdk"
import { LoaderOptions, Logger, ModulesSdkTypes } from "@medusajs/types"
import { ContainerRegistrationKeys, defaultCurrencies } from "@medusajs/utils"
import { Currency } from "@models"

export default async ({
  container,
  options,
}: LoaderOptions<
  | ModulesSdkTypes.ModuleServiceInitializeOptions
  | ModulesSdkTypes.ModuleServiceInitializeCustomDataLayerOptions
>): Promise<void> => {
  // TODO: Add default logger to the container when running tests
  const logger =
    container.resolve<Logger>(ContainerRegistrationKeys.LOGGER) ?? console
  const { currencyService_ } = container.resolve<{
    currencyService_: ModulesSdkTypes.IMedusaInternalService<typeof Currency>
  }>(ModuleRegistrationName.CURRENCY)

  try {
    const normalizedCurrencies = Object.values(defaultCurrencies).map((c) => ({
      ...c,
      code: c.code.toLowerCase(),
    }))
    const resp = await currencyService_.upsert(normalizedCurrencies)
    logger.debug(`Loaded ${resp.length} currencies`)
  } catch (error) {
    logger.warn(
      `Failed to load currencies, skipping loader. Original error: ${error.message}`
    )
  }
}
