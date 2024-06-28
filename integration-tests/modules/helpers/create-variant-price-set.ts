import { MedusaContainer } from "@medusajs/modules-sdk"
import {
  CreatePriceSetDTO,
  IPricingModuleService,
  PriceSetDTO,
} from "@medusajs/types"
import { Modules } from "@medusajs/utils"

const defaultPrices = [
  {
    amount: 3000,
    currency_code: "usd",
  },
]

const defaultPriceSetRules = [{ rule_attribute: "region_id" }]

export const createVariantPriceSet = async ({
  container,
  variantId,
  prices = defaultPrices,
  rules = defaultPriceSetRules,
}: {
  container: MedusaContainer
  variantId: string
  prices?: CreatePriceSetDTO["prices"]
  rules?: CreatePriceSetDTO["rules"]
}): Promise<PriceSetDTO> => {
  const remoteLink = container.resolve("remoteLink")
  const pricingModuleService: IPricingModuleService = container.resolve(
    "pricingModuleService"
  )

  const priceSet = await pricingModuleService.createPriceSets({
    rules,
    prices,
  })

  await remoteLink.create({
    [Modules.PRODUCT]: { variant_id: variantId },
    [Modules.PRICING]: { price_set_id: priceSet.id },
  })

  return await pricingModuleService.retrievePriceSet(priceSet.id, {
    relations: ["prices"],
  })
}
