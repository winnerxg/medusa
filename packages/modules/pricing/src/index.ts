import { ModuleExports } from "@medusajs/types"
import { PricingModuleService } from "@services"

const service = PricingModuleService

export const moduleDefinition: ModuleExports = {
  service,
}

export default moduleDefinition

export * from "./types"
